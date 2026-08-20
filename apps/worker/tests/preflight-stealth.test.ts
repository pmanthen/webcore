import { describe, expect, it } from "vitest";

import {
  COOKIE_AND_POPUP_SELECTORS,
  preflightOptionsFromEnv,
} from "../src/services/browser/preflight.js";
import {
  DEFAULT_ACCEPT_LANGUAGE,
  DEFAULT_USER_AGENT,
  STEALTH_CHROMIUM_ARGS,
  STEALTH_INIT_SCRIPT,
  buildStealthLaunchOptions,
} from "../src/services/browser/stealth.js";
import type { WorkerEnv } from "../src/env.js";

function fakeEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DATABASE_URL: "postgresql://localhost/test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    UX_EVALUATION_MODE: "live",
    STAGEHAND_ENV: "LOCAL",
    STAGEHAND_MODEL: "openai/gpt-4.1-mini",
    STAGEHAND_VERBOSE: 0,
    STAGEHAND_OPENAI_ENDPOINT_FORMAT: "responses",
    WORKER_CONCURRENCY: 1,
    UX_VIEWPORT_WIDTH: 1920,
    UX_VIEWPORT_HEIGHT: 1080,
    UX_NAV_TIMEOUT_MS: 45_000,
    UX_EXTRACT_TIMEOUT_MS: 90_000,
    UX_MAX_ELEMENT_SCREENSHOTS: 8,
    UX_USER_AGENT: DEFAULT_USER_AGENT,
    UX_ACCEPT_LANGUAGE: DEFAULT_ACCEPT_LANGUAGE,
    STAGEHAND_CACHE_DIR: ".stagehand-cache",
    UX_NETWORK_IDLE_TIMEOUT_MS: 15_000,
    UX_PREFLIGHT_CLICK_TIMEOUT_MS: 500,
    UX_PREFLIGHT_SCROLL_PAUSE_MS: 120,
    UX_PREFLIGHT_MAX_SCROLL_MS: 4_000,
    UX_PREFLIGHT_AI_FALLBACK: true,
    UX_PREFLIGHT_AI_TIMEOUT_MS: 15_000,
    MINIO_ENDPOINT: "localhost",
    MINIO_PORT: 9000,
    MINIO_USE_SSL: false,
    MINIO_ACCESS_KEY: "minioadmin",
    MINIO_SECRET_KEY: "minioadmin",
    MINIO_BUCKET: "ux-artifacts",
    MINIO_PUBLIC_URL: "http://localhost:9000",
    ...overrides,
  };
}

describe("stealth launch options", () => {
  it("includes AutomationControlled disable and a desktop viewport", () => {
    const options = buildStealthLaunchOptions(fakeEnv());

    expect(options.headless).toBe(true);
    expect(options.viewport).toEqual({ width: 1920, height: 1080 });
    expect(options.locale).toBe("en-US");
    expect(options.args).toContain("--disable-blink-features=AutomationControlled");
    expect(STEALTH_CHROMIUM_ARGS.length).toBeGreaterThan(3);
  });

  it("masks navigator.webdriver in the init script", () => {
    expect(STEALTH_INIT_SCRIPT).toContain('navigator, "webdriver"');
    expect(STEALTH_INIT_SCRIPT).toContain("undefined");
  });
});

describe("preflight configuration", () => {
  it("maps env knobs into the preflight options object", () => {
    const options = preflightOptionsFromEnv(
      fakeEnv({
        UX_NETWORK_IDLE_TIMEOUT_MS: 12_000,
        UX_PREFLIGHT_CLICK_TIMEOUT_MS: 400,
        UX_PREFLIGHT_AI_FALLBACK: false,
      }),
    );

    expect(options.networkIdleTimeoutMs).toBe(12_000);
    expect(options.clickTimeoutMs).toBe(400);
    expect(options.aiFallbackEnabled).toBe(false);
  });

  it("defaults AI fallback to enabled when env says true", () => {
    expect(preflightOptionsFromEnv(fakeEnv()).aiFallbackEnabled).toBe(true);
  });

  it("treats overlays covering 40% of the viewport as blocking", async () => {
    const { OVERLAY_COVERAGE_THRESHOLD } = await import(
      "../src/services/browser/preflight.js"
    );
    expect(OVERLAY_COVERAGE_THRESHOLD).toBe(0.4);
  });

  it("keeps the cookie selector list short and includes OneTrust", () => {
    expect(COOKIE_AND_POPUP_SELECTORS).toContain("#onetrust-accept-btn-handler");
    expect(COOKIE_AND_POPUP_SELECTORS).toContain("[aria-label='Close dialog']");
    // Guard against accidental growth that would inflate per-run click budget.
    expect(COOKIE_AND_POPUP_SELECTORS.length).toBeLessThanOrEqual(40);
  });
});
