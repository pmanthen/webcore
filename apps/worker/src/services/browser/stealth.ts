import type { Stagehand, V3Options } from "@browserbasehq/stagehand";

import type { WorkerEnv } from "../../env.js";
import type { StagehandPage } from "./types.js";

/**
 * Chromium flags that reduce the most common AutomationControlled signals.
 *
 * Stagehand v3 drives Chromium over CDP (its own "understudy" layer), so
 * `puppeteer-extra-plugin-stealth` / `playwright-extra` cannot plug in cleanly.
 * These launch args plus the init script below cover the same high-value surface
 * (webdriver flag, automation blink feature, locale/UA headers) without swapping
 * Stagehand's browser engine.
 */
export const STEALTH_CHROMIUM_ARGS: readonly string[] = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-infobars",
  "--no-default-browser-check",
  "--no-first-run",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
];

/**
 * Document-start script that masks the usual headless tells before page JS runs.
 * Kept as a string so Stagehand installs it verbatim (no Function.toString issues).
 */
export const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
      configurable: true,
    });
  } catch (_) {}

  try {
    if (!window.chrome) {
      Object.defineProperty(window, "chrome", {
        value: { runtime: {} },
        configurable: true,
      });
    }
  } catch (_) {}

  try {
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (typeof originalQuery === "function") {
      window.navigator.permissions.query = (parameters) => (
        parameters && parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    }
  } catch (_) {}

  try {
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
      configurable: true,
    });
  } catch (_) {}

  try {
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
      configurable: true,
    });
  } catch (_) {}
})();
`;

/** Default desktop Chrome UA — override via UX_USER_AGENT. */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

/**
 * Local Chromium launch options with stealth args, locale, and viewport.
 * Callers merge this into `V3Options.localBrowserLaunchOptions`.
 */
export function buildStealthLaunchOptions(
  env: WorkerEnv,
): NonNullable<V3Options["localBrowserLaunchOptions"]> {
  return {
    headless: true,
    locale: env.UX_ACCEPT_LANGUAGE.split(",")[0]?.trim() || "en-US",
    viewport: {
      width: env.UX_VIEWPORT_WIDTH,
      height: env.UX_VIEWPORT_HEIGHT,
    },
    args: [...STEALTH_CHROMIUM_ARGS],
  };
}

/**
 * Browserbase session knobs that lean on their fingerprint / advanced stealth
 * stack when the worker is not launching Chromium itself.
 */
export function buildBrowserbaseStealthParams(
  env: WorkerEnv,
): NonNullable<V3Options["browserbaseSessionCreateParams"]> {
  return {
    browserSettings: {
      advancedStealth: true,
      fingerprint: {
        browsers: ["chrome"],
        devices: ["desktop"],
        locales: ["en-US"],
        operatingSystems: ["windows"],
        screen: {
          minWidth: env.UX_VIEWPORT_WIDTH,
          maxWidth: env.UX_VIEWPORT_WIDTH,
          minHeight: env.UX_VIEWPORT_HEIGHT,
          maxHeight: env.UX_VIEWPORT_HEIGHT,
        },
      },
      viewport: {
        width: env.UX_VIEWPORT_WIDTH,
        height: env.UX_VIEWPORT_HEIGHT,
      },
    },
  };
}

/**
 * Apply Accept-Language / User-Agent headers and the stealth init script to the
 * active context/page. Must run after `stagehand.init()` and before `page.goto()`.
 */
export async function applyStealthContext(
  stagehand: Stagehand,
  page: StagehandPage,
  env: WorkerEnv,
): Promise<void> {
  const headers = {
    "Accept-Language": env.UX_ACCEPT_LANGUAGE,
    "User-Agent": env.UX_USER_AGENT,
  };

  await stagehand.context.setExtraHTTPHeaders(headers);
  await page.setExtraHTTPHeaders(headers);
  await page.addInitScript(STEALTH_INIT_SCRIPT);
  await page.setViewportSize(env.UX_VIEWPORT_WIDTH, env.UX_VIEWPORT_HEIGHT);
}
