import {
  Stagehand,
  type Action,
  type ModelConfiguration,
  type V3Options,
} from "@browserbasehq/stagehand";
import type { EvaluationRunResult, UxFinding } from "@autonomous-ux/database";

import { getEnv } from "../env.js";
import {
  preflightOptionsFromEnv,
  runPreflightCleanup,
  type PreflightReport,
} from "./browser/preflight.js";
import {
  applyStealthContext,
  buildBrowserbaseStealthParams,
  buildStealthLaunchOptions,
} from "./browser/stealth.js";
import {
  HEURISTIC_PILLARS,
  pageOverviewSchema,
  pillarExtractionSchema,
  type PageOverview,
} from "./heuristics/schemas.js";
import { extractStructured } from "./heuristics/extract.js";
import {
  resolveFindings,
  type ResolvedFinding,
} from "./heuristics/resolve-findings.js";
import { buildMockEvaluationResult } from "./mock-findings.js";
import {
  captureElementCrop,
  captureFullPage,
  elementExists,
} from "./screenshots.js";
import { buildExecutiveSummary, scoreFindings } from "./scoring.js";
import { buildScreenshotKey, uploadArtifact } from "./storage.js";

const OBSERVE_INSTRUCTION =
  "Find every interactable element a visitor could use: links, buttons, form fields, selects, tabs, and menu triggers.";

function buildModelConfiguration(): ModelConfiguration {
  const env = getEnv();
  const apiKey = env.STAGEHAND_MODEL_API_KEY ?? env.OPENAI_API_KEY;

  // A plain model name lets Stagehand resolve credentials from the environment
  // itself; only override when a gateway or explicit key is configured.
  if (!apiKey && !env.STAGEHAND_BASE_URL) {
    return env.STAGEHAND_MODEL;
  }

  return {
    modelName: env.STAGEHAND_MODEL,
    ...(apiKey ? { apiKey } : {}),
    ...(env.STAGEHAND_BASE_URL ? { baseURL: env.STAGEHAND_BASE_URL } : {}),
    openaiEndpointFormat: env.STAGEHAND_OPENAI_ENDPOINT_FORMAT,
  };
}

function buildStagehandOptions(): V3Options {
  const env = getEnv();

  const options: V3Options = {
    env: env.STAGEHAND_ENV,
    model: buildModelConfiguration(),
    verbose: env.STAGEHAND_VERBOSE as 0 | 1 | 2,
    // Persist successful act() selectors so repeated dismissals / interactions
    // against the same URL shape skip the LLM on later runs.
    cacheDir: env.STAGEHAND_CACHE_DIR,
    localBrowserLaunchOptions: buildStealthLaunchOptions(env),
  };

  if (env.STAGEHAND_ENV === "BROWSERBASE") {
    options.apiKey = env.BROWSERBASE_API_KEY;
    options.projectId = env.BROWSERBASE_PROJECT_ID;
    options.browserbaseSessionCreateParams =
      buildBrowserbaseStealthParams(env);
  }

  return options;
}

/**
 * `page.goto` does not reject when a host is unreachable — Chrome simply renders
 * its own error page, and the audit would then happily report findings about
 * "This site can't be reached" as if they were the customer's. Treat anything
 * that did not actually load as a run failure.
 */
function assertNavigationSucceeded(
  requestedUrl: string,
  landedUrl: string,
  response: { status: () => number; statusText: () => string } | null,
): void {
  if (landedUrl.startsWith("chrome-error://")) {
    throw new Error(`Navigation to ${requestedUrl} failed: the host is unreachable`);
  }

  if (!response) {
    throw new Error(
      `Navigation to ${requestedUrl} produced no HTTP response; the page did not load`,
    );
  }

  const status = response.status();
  if (status >= 400) {
    throw new Error(
      `Navigation to ${requestedUrl} returned HTTP ${status} ${response.statusText()}; there is no page to audit`,
    );
  }
}

/** Findings that justify spending a screenshot, worst first. */
function croppableFindings(
  findings: readonly ResolvedFinding[],
): ResolvedFinding[] {
  return findings
    .filter(
      (finding) =>
        Boolean(finding.elementSelector) &&
        (finding.severity === "High" || finding.severity === "Medium"),
    )
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "High" ? -1 : 1));
}

/**
 * Heuristic UX audit driven by Stagehand.
 *
 * 1. Launch Chromium with stealth args / headers (or Browserbase advanced stealth).
 * 2. Navigate to the target URL.
 * 3. Deterministic pre-flight: network settle, lazy-load scroll, cookie/popup dismissal.
 * 4. Capture and store a full-page screenshot.
 * 5. `observe()` the interactable elements, giving later steps real selectors.
 * 6. `extract()` once per heuristic pillar against a strict Zod schema.
 * 7. Crop and store evidence for the findings that warrant it.
 * 8. Score the page and write an executive summary.
 *
 * Navigation and browser failures propagate so the worker marks the run FAILED.
 * A single pillar or screenshot failing is logged and skipped — a partial audit
 * is worth more than none.
 */
export async function runUxEvaluation(
  url: string,
  context: { runId: string },
): Promise<EvaluationRunResult> {
  const env = getEnv();

  if (env.UX_EVALUATION_MODE === "mock") {
    return buildMockEvaluationResult(url, {
      mode: "mock",
      note: "Mock evaluation mode (UX_EVALUATION_MODE=mock).",
    });
  }

  const startedAt = Date.now();
  const stagehand = new Stagehand(buildStagehandOptions());
  const pillarErrors: Record<string, string> = {};
  let preflight: PreflightReport | null = null;

  try {
    await stagehand.init();

    const page =
      stagehand.context.activePage() ?? (await stagehand.context.newPage());

    await applyStealthContext(stagehand, page, env);

    const response = await page.goto(url, {
      waitUntil: "load",
      timeoutMs: env.UX_NAV_TIMEOUT_MS,
    });

    const landedUrl = page.url() || url;
    assertNavigationSucceeded(url, landedUrl, response);
    const pageTitle = await page.title().catch(() => "");

    try {
      preflight = await runPreflightCleanup(
        page,
        stagehand,
        preflightOptionsFromEnv(env),
      );
      console.info("[ux-evaluation] preflight complete", {
        runId: context.runId,
        ...preflight,
      });
    } catch (error) {
      // Pre-flight is best-effort: never abort an otherwise reachable page.
      pillarErrors.preflight = errorMessage(error);
      console.warn("[ux-evaluation] preflight failed; continuing", error);
    }

    const runScreenshot = await uploadArtifact(
      buildScreenshotKey(context.runId, "full-page"),
      await captureFullPage(page),
    );
    let observed: Action[] = [];
    try {
      observed = await stagehand.observe(OBSERVE_INSTRUCTION, {
        timeout: env.UX_EXTRACT_TIMEOUT_MS,
      });
    } catch (error) {
      pillarErrors.observe = errorMessage(error);
      console.warn("[ux-evaluation] observe failed; continuing", error);
    }

    let overview: PageOverview | null = null;
    try {
      overview = await extractStructured(
        stagehand,
        "Summarize what this page is for and how well it serves a first-time visitor.",
        pageOverviewSchema,
        { timeout: env.UX_EXTRACT_TIMEOUT_MS },
      );
    } catch (error) {
      pillarErrors.overview = errorMessage(error);
      console.warn("[ux-evaluation] overview extract failed", error);
    }

    const findings: ResolvedFinding[] = [];
    const rawByPillar: Record<string, unknown> = {};

    for (const pillar of HEURISTIC_PILLARS) {
      try {
        const extraction = await extractStructured(
          stagehand,
          pillar.instruction,
          pillarExtractionSchema,
          { timeout: env.UX_EXTRACT_TIMEOUT_MS },
        );

        rawByPillar[pillar.category] = extraction.findings;

        findings.push(
          ...(await resolveFindings(extraction.findings, {
            category: pillar.category,
            pageUrl: landedUrl,
            observed,
            selectorExists: (selector) => elementExists(page, selector),
          })),
        );
      } catch (error) {
        pillarErrors[pillar.category] = errorMessage(error);
        console.warn(
          `[ux-evaluation] extract failed for pillar ${pillar.category}`,
          error,
        );
      }
    }

    // Evidence crops, worst findings first, capped so a noisy page cannot
    // flood object storage.
    let cropped = 0;
    for (const finding of croppableFindings(findings)) {
      if (cropped >= env.UX_MAX_ELEMENT_SCREENSHOTS) {
        break;
      }

      const selector = finding.elementSelector;
      if (!selector) {
        continue;
      }

      try {
        const crop = await captureElementCrop(page, selector);
        if (!crop) {
          continue;
        }

        const artifact = await uploadArtifact(
          buildScreenshotKey(
            context.runId,
            `${finding.category}-${cropped + 1}-${finding.title}`,
          ),
          crop,
        );

        finding.screenshotKey = artifact.key;
        finding.screenshotUrl = artifact.url;
        cropped += 1;
      } catch (error) {
        console.warn("[ux-evaluation] element crop failed", {
          selector,
          error,
        });
      }
    }

    const score = scoreFindings(findings);
    const summary = buildExecutiveSummary(findings, {
      url: landedUrl,
      score,
      pageType: overview?.pageType ?? null,
      primaryGoal: overview?.primaryGoal ?? null,
      overallImpression: overview?.overallImpression ?? null,
    });

    return {
      summary,
      score,
      findings: findings.map(toUxFinding),
      screenshotKey: runScreenshot.key,
      screenshotUrl: runScreenshot.url,
      rawResponse: {
        mode: "live",
        url,
        landedUrl,
        pageTitle,
        model: env.STAGEHAND_MODEL,
        overview,
        preflight,
        observedElements: observed.length,
        observedActions: observed.slice(0, 40),
        rawFindingsByPillar: rawByPillar,
        selectorSources: findings.map((finding) => ({
          title: finding.title,
          selectorSource: finding.selectorSource,
          proposedSelector: finding.proposedSelector,
          elementSelector: finding.elementSelector,
        })),
        elementScreenshots: cropped,
        ...(Object.keys(pillarErrors).length > 0 ? { pillarErrors } : {}),
        durationMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[ux-evaluation] Stagehand live run failed", error);
    throw error instanceof Error
      ? error
      : new Error("Stagehand live evaluation failed");
  } finally {
    try {
      await stagehand.close();
    } catch (closeError) {
      console.warn("[ux-evaluation] stagehand.close failed", closeError);
    }
  }
}

function toUxFinding(finding: ResolvedFinding): UxFinding {
  return {
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    recommendation: finding.recommendation,
    elementSelector: finding.elementSelector ?? null,
    pageUrl: finding.pageUrl ?? null,
    screenshotKey: finding.screenshotKey ?? null,
    screenshotUrl: finding.screenshotUrl ?? null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
