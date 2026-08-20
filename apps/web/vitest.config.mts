import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@autonomous-ux/database": fileURLToPath(
        new URL("../../packages/database/src/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    name: "web",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
