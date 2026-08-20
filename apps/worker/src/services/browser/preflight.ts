import type { Stagehand } from "@browserbasehq/stagehand";

import type { WorkerEnv } from "../../env.js";
import type { StagehandPage } from "./types.js";

/**
 * Common cookie / CMP / modal close selectors. Deterministic first — LLM only
 * as a last resort when an overlay still covers the viewport.
 *
 * Matched via a single combined locator so misses share one timeout budget
 * instead of compounding UX_PREFLIGHT_CLICK_TIMEOUT_MS per selector.
 */
export const COOKIE_AND_POPUP_SELECTORS: readonly string[] = [
  // OneTrust / Cookiebot / TrustArc / Quantcast / Didomi / common CMPs
  "#onetrust-accept-btn-handler",
  "#onetrust-reject-all-handler",
  ".onetrust-close-btn-handler",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#CybotCookiebotDialogBodyButtonAccept",
  "#accept-recommended-btn-handler",
  ".cc-btn.cc-dismiss",
  ".cc-nb-okagree",
  "#cookie-accept",
  "#cookieAccept",
  ".cookie-banner-accept",
  ".cookie-accept",
  ".cookie-consent-accept",
  "[data-testid='cookie-accept']",
  "[data-testid='accept-cookies']",
  "button#accept-cookies",
  "button[aria-label='Accept cookies']",
  "button[aria-label='Accept all']",
  "button[aria-label='Accept All']",
  "#truste-consent-button",
  ".trustarc-agree-btn",
  "#qc-cmp2-ui button[mode='primary']",
  "#didomi-notice-agree-button",
  ".fc-cta-consent",
  ".js-cookie-accept",
  // Generic dialog / newsletter dismissals
  "[aria-label='Close dialog']",
  "[aria-label='Close']",
  "[aria-label='Dismiss']",
  "button[aria-label='Close modal']",
  "[data-dismiss='modal']",
  ".modal-close",
  ".popup-close",
  "#close-popup",
];

const AI_FALLBACK_INSTRUCTION =
  "Click the 'Accept All' cookies button or close the newsletter popup if one exists. " +
  "If neither is present, do nothing.";

/** Fraction of viewport area an element must cover to count as a blocking overlay. */
export const OVERLAY_COVERAGE_THRESHOLD = 0.4;

/** Max combined-locator dismissal passes (stacked CMP → newsletter, etc.). */
const MAX_DISMISS_ATTEMPTS = 3;

export interface PreflightOptions {
  networkIdleTimeoutMs: number;
  clickTimeoutMs: number;
  scrollStepPauseMs: number;
  maxScrollDurationMs: number;
  aiFallbackEnabled: boolean;
  aiFallbackTimeoutMs: number;
}

export interface PreflightReport {
  networkIdleSettled: boolean;
  scrolled: boolean;
  dismissedSelectors: string[];
  overlayDetected: boolean;
  aiFallbackUsed: boolean;
  aiFallbackSucceeded: boolean;
  durationMs: number;
}

export function preflightOptionsFromEnv(env: WorkerEnv): PreflightOptions {
  return {
    networkIdleTimeoutMs: env.UX_NETWORK_IDLE_TIMEOUT_MS,
    clickTimeoutMs: env.UX_PREFLIGHT_CLICK_TIMEOUT_MS,
    scrollStepPauseMs: env.UX_PREFLIGHT_SCROLL_PAUSE_MS,
    maxScrollDurationMs: env.UX_PREFLIGHT_MAX_SCROLL_MS,
    aiFallbackEnabled: env.UX_PREFLIGHT_AI_FALLBACK,
    aiFallbackTimeoutMs: env.UX_PREFLIGHT_AI_TIMEOUT_MS,
  };
}

/**
 * Deterministic page stabilization that runs after `page.goto()` and before any
 * Stagehand AI primitive (`observe` / `extract` / `act` for the audit itself).
 *
 * Order matters and is intentionally cheap → expensive:
 * 1. Soft network-idle wait (never throws).
 * 2. Incremental scroll to mount lazy content, then return to top.
 * 3. Fast combined-locator cookie/popup clicks (one timeout budget per attempt).
 * 4. AI `act()` only if a large overlay still covers the viewport.
 */
export async function runPreflightCleanup(
  page: StagehandPage,
  stagehand: Stagehand,
  options: PreflightOptions,
): Promise<PreflightReport> {
  const startedAt = Date.now();
  const report: PreflightReport = {
    networkIdleSettled: false,
    scrolled: false,
    dismissedSelectors: [],
    overlayDetected: false,
    aiFallbackUsed: false,
    aiFallbackSucceeded: false,
    durationMs: 0,
  };

  report.networkIdleSettled = await settleNetwork(page, options.networkIdleTimeoutMs);
  report.scrolled = await scrollForLazyContent(page, options);
  report.dismissedSelectors = await dismissCookieBannersAndPopups(
    page,
    options.clickTimeoutMs,
  );

  report.overlayDetected = await hasBlockingOverlay(page);
  if (report.overlayDetected && options.aiFallbackEnabled) {
    report.aiFallbackUsed = true;
    report.aiFallbackSucceeded = await dismissOverlayWithAi(
      stagehand,
      options.aiFallbackTimeoutMs,
    );
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

async function settleNetwork(
  page: StagehandPage,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await page.waitForLoadState("networkidle", timeoutMs);
    return true;
  } catch (error) {
    // SPAs and analytics beacons rarely go fully idle; continue with what loaded.
    console.warn("[preflight] networkidle wait timed out; continuing", {
      timeoutMs,
      error: errorMessage(error),
    });
    return false;
  }
}

/**
 * Scroll the document in viewport-sized increments so IntersectionObserver /
 * lazy image loaders fire, then return to the top for a stable audit viewport.
 *
 * Uses a hard wall-clock budget so a very tall page cannot inflate the job.
 * Callbacks passed to `page.evaluate` stay flat — see screenshots.ts note on
 * esbuild `__name` rewriting.
 */
async function scrollForLazyContent(
  page: StagehandPage,
  options: Pick<PreflightOptions, "scrollStepPauseMs" | "maxScrollDurationMs">,
): Promise<boolean> {
  const deadline = Date.now() + options.maxScrollDurationMs;

  try {
    const metrics = await page.evaluate<{
      scrollHeight: number;
      viewportHeight: number;
    }>(() => ({
      scrollHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0,
      ),
      viewportHeight: window.innerHeight || 800,
    }));

    const step = Math.max(200, Math.floor(metrics.viewportHeight * 0.85));
    let y = 0;

    while (y < metrics.scrollHeight && Date.now() < deadline) {
      y = Math.min(y + step, metrics.scrollHeight);
      await page.evaluate((top) => {
        window.scrollTo(0, top);
      }, y);
      await sleep(options.scrollStepPauseMs);
    }

    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await sleep(options.scrollStepPauseMs);
    return true;
  } catch (error) {
    console.warn("[preflight] lazy-load scroll failed; continuing", {
      error: errorMessage(error),
    });
    return false;
  }
}

/**
 * Dismiss visible cookie/CMP/modal controls with a combined CSS locator so the
 * entire selector list shares a single click-timeout budget per attempt.
 */
async function dismissCookieBannersAndPopups(
  page: StagehandPage,
  clickTimeoutMs: number,
): Promise<string[]> {
  const dismissed: string[] = [];
  const combinedSelector = COOKIE_AND_POPUP_SELECTORS.join(", ");

  for (let attempt = 0; attempt < MAX_DISMISS_ATTEMPTS; attempt += 1) {
    const matched = await Promise.race([
      findFirstVisibleSelector(page, COOKIE_AND_POPUP_SELECTORS),
      sleep(clickTimeoutMs).then(() => null as string | null),
    ]);

    if (!matched) {
      break;
    }

    try {
      await Promise.race([
        page.locator(combinedSelector).first().click(),
        sleep(clickTimeoutMs).then(() => {
          throw new Error(`click timed out after ${clickTimeoutMs}ms`);
        }),
      ]);
      dismissed.push(matched);
      // Give the CMP a beat to tear down before probing for a stacked modal.
      await sleep(150);
    } catch {
      break;
    }
  }

  return dismissed;
}

/** Return the first selector in `selectors` that currently matches a visible node. */
async function findFirstVisibleSelector(
  page: StagehandPage,
  selectors: readonly string[],
): Promise<string | null> {
  return page.evaluate<string | null, string[]>((list) => {
    for (let i = 0; i < list.length; i += 1) {
      const raw = list[i];
      if (typeof raw !== "string") {
        continue;
      }

      let element: Element | null = null;
      try {
        element = document.querySelector(raw);
      } catch {
        continue;
      }
      if (!element) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return raw;
      }
    }

    return null;
  }, [...selectors]);
}

/**
 * True when a fixed/sticky/dialog-like node covers a large fraction of the
 * viewport — typical of unresolved cookie walls and newsletter modals.
 */
export async function hasBlockingOverlay(page: StagehandPage): Promise<boolean> {
  return page.evaluate<boolean, number>((threshold) => {
    const viewportWidth = window.innerWidth || 1;
    const viewportHeight = window.innerHeight || 1;
    const viewportArea = viewportWidth * viewportHeight;
    const nodes = document.querySelectorAll(
      "div, dialog, section, aside, [role='dialog'], [aria-modal='true']",
    );

    for (let i = 0; i < nodes.length; i += 1) {
      const element = nodes[i];
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const style = window.getComputedStyle(element);
      const position = style.position;
      const isDialog =
        element.tagName === "DIALOG" ||
        element.getAttribute("role") === "dialog" ||
        element.getAttribute("aria-modal") === "true";

      if (
        position !== "fixed" &&
        position !== "sticky" &&
        position !== "absolute" &&
        !isDialog
      ) {
        continue;
      }

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none" ||
        Number(style.opacity) === 0
      ) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        continue;
      }

      const overlapWidth =
        Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
      const overlapHeight =
        Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      if (overlapWidth <= 0 || overlapHeight <= 0) {
        continue;
      }

      const coverage = (overlapWidth * overlapHeight) / viewportArea;
      if (coverage >= threshold) {
        return true;
      }
    }

    return false;
  }, OVERLAY_COVERAGE_THRESHOLD);
}

async function dismissOverlayWithAi(
  stagehand: Stagehand,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await stagehand.act(AI_FALLBACK_INSTRUCTION, { timeout: timeoutMs });
    return true;
  } catch (error) {
    console.warn("[preflight] AI overlay dismissal failed; continuing", {
      error: errorMessage(error),
    });
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
