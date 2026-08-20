import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /**
   * `mock` — skip browser automation and persist sample UX issues (default for local).
   * `live` — run Stagehand (Playwright) against the target URL.
   */
  UX_EVALUATION_MODE: z.enum(["mock", "live"]).default("mock"),
  STAGEHAND_ENV: z.enum(["LOCAL", "BROWSERBASE"]).default("LOCAL"),
  STAGEHAND_MODEL: z.string().default("openai/gpt-4.1-mini"),
  STAGEHAND_VERBOSE: z.coerce.number().int().min(0).max(2).default(1),
  OPENAI_API_KEY: z.string().optional(),
  /** Overrides OPENAI_API_KEY when the model is served by a gateway. */
  STAGEHAND_MODEL_API_KEY: z.string().optional(),
  /** OpenAI-compatible base URL (self-hosted gateway, proxy, or test double). */
  STAGEHAND_BASE_URL: z.string().url().optional(),
  /** `chat` for gateways exposing only /chat/completions. */
  STAGEHAND_OPENAI_ENDPOINT_FORMAT: z
    .enum(["responses", "chat"])
    .default("responses"),
  BROWSERBASE_API_KEY: z.string().optional(),
  BROWSERBASE_PROJECT_ID: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),

  // Audit tuning.
  UX_VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1440),
  UX_VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(900),
  UX_NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  UX_EXTRACT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /** Cap on element crops per run, so a noisy page cannot flood object storage. */
  UX_MAX_ELEMENT_SCREENSHOTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(8),

  // MinIO / S3-compatible object storage for screenshots.
  MINIO_ENDPOINT: z.string().min(1).default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MINIO_ACCESS_KEY: z.string().min(1).default("minioadmin"),
  MINIO_SECRET_KEY: z.string().min(1).default("minioadmin"),
  MINIO_BUCKET: z.string().min(1).default("ux-artifacts"),
  /** Base URL for direct (non-proxied) artifact links. */
  MINIO_PUBLIC_URL: z.string().url().default("http://localhost:9000"),
});

export type WorkerEnv = z.infer<typeof envSchema>;

let cached: WorkerEnv | null = null;

export function getEnv(): WorkerEnv {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid worker environment: ${details}`);
  }

  cached = parsed.data;
  return cached;
}
