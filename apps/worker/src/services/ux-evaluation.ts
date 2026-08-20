import {
  Stagehand,
  type Action,
  type V3Options,
} from "@browserbasehq/stagehand";
import type { EvaluationResultPayload } from "@autonomous-ux/database";

import { getEnv } from "../env.js";
import { buildMockEvaluationResult } from "./mock-issues.js";

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
 */
export async function runUxEvaluation(
  url: string,
): Promise<EvaluationResultPayload> {
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

    // Probe interactive affordances without mutating the page yet.
    observedActions = await stagehand.observe(
      "Find the primary navigation links and the main call-to-action button",
    );

    // Optional: exercise the first observed action when Stagehand returns one.
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
    console.error(
      "[ux-evaluation] Stagehand live run failed; falling back to mock payload",
      error,
    );
    return buildMockEvaluationResult(url, {
      mode: "live",
      observedActions,
      note: `Stagehand error fallback: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    });
  } finally {
    try {
      await stagehand.close();
    } catch (closeError) {
      console.warn("[ux-evaluation] stagehand.close failed", closeError);
    }
  }
}
