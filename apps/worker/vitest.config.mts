import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Run against the shared package's source rather than its build output,
      // so a test run never depends on `build:db` having happened first.
      "@autonomous-ux/database": fileURLToPath(
        new URL("../../packages/database/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "worker",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // The shared package constructs a PrismaClient on import. Construction is
      // lazy — nothing connects until a query runs — but it needs the datasource
      // URL to be present and well-formed.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
    },
  },
});
