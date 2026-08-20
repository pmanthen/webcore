import {
  Stagehand,
  type Action,
  type V3Options,
} from "@browserbasehq/stagehand";
import type { EvaluationRunResult } from "@autonomous-ux/database";

import { getEnv } from "../env.js";
import { buildMockEvaluationResult } from "./mock-findings.js";

function buildStagehandOptions(): V3Options {
  const env = getEnv();

  const options: V3Options = {
    env: env.STAGEHAND_ENV,
    model: env.STAGEHAND_MODEL,
    verbose: env.STAGEHAND_VERBOSE as 0 | 1 | 2,
    localBrowserLaunchOptions: {
      headless: true,
    },
  };

  if (env.STAGEHAND_ENV === "BROWSERBASE") {
    options.apiKey = env.BROWSERBASE_API_KEY;
    options.projectId = env.BROWSERBASE_PROJECT_ID;
  }

  return options;
}

/**
 * Skeleton UX evaluation using Stagehand + Playwright.
 *
 * Flow:
 * 1. Initialize Stagehand (LOCAL Chromium or Browserbase)
 * 2. Navigate to the target URL
 * 3. Use `observe()` / `act()` primitives to probe the page
 * 4. Return a structured evaluation payload (mock issues for Phase 1)
 *
 * Live-mode browser/LLM failures propagate to the worker so the project is
 * marked FAILED (after retries), instead of being reported as COMPLETED.
 */
export async function runUxEvaluation(
  url: string,
  _context: { runId: string },
): Promise<EvaluationRunResult> {
  const env = getEnv();

  if (env.UX_EVALUATION_MODE === "mock") {
    return buildMockEvaluationResult(url, {
      mode: "mock",
      note: "Mock evaluation mode (UX_EVALUATION_MODE=mock).",
    });
  }

  const stagehand = new Stagehand(buildStagehandOptions());
  let observedActions: Action[] = [];

  try {
    await stagehand.init();

    const page =
      stagehand.context.activePage() ??
      (await stagehand.context.newPage());

    await page.goto(url, { waitUntil: "domcontentloaded" });

    observedActions = await stagehand.observe(
      "Find the primary navigation links and the main call-to-action button",
    );

    const firstAction = observedActions[0];
    if (firstAction) {
      try {
        await stagehand.act(firstAction);
      } catch (actError) {
        console.warn(
          "[ux-evaluation] stagehand.act failed; continuing with observe results",
          actError,
        );
      }
    }

    return buildMockEvaluationResult(url, {
      mode: "live",
      observedActions,
      note: "Live Stagehand browse completed; UX issue list is still a scaffold.",
    });
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
