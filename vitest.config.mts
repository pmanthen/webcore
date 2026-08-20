import { defineConfig } from "vitest/config";

/**
 * Root entry point for the monorepo test run. Each workspace owns its own
 * `vitest.config.mts` so `npm run test -w <package>` behaves identically to the
 * project as it runs here.
 *
 * The configs are `.mts` rather than `.ts` because only `apps/worker` declares
 * `"type": "module"`; the explicit extension keeps every one of them ESM
 * regardless of the package it sits in.
 */
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.mts", "apps/*/vitest.config.mts"],
  },
});
