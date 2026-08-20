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
  UX_VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1920),
  UX_VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(1080),
  UX_NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  UX_EXTRACT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /** Cap on element crops per run, so a noisy page cannot flood object storage. */
  UX_MAX_ELEMENT_SCREENSHOTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(8),

  // Stealth / anti-bot headers applied to every browser context.
  UX_USER_AGENT: z
    .string()
    .min(1)
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ),
  UX_ACCEPT_LANGUAGE: z.string().min(1).default("en-US,en;q=0.9"),

  /**
   * Directory for Stagehand act() selector caching. Successful act() results are
   * reused on subsequent runs against the same URL shape, skipping the LLM.
   */
  STAGEHAND_CACHE_DIR: z.string().min(1).default(".stagehand-cache"),

  // Pre-flight page stabilization (deterministic, before any AI primitive).
  /** Soft wait for networkidle after navigation; never fails the run. */
  UX_NETWORK_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000),
  /** Per-selector budget when probing cookie/popup dismiss controls. */
  UX_PREFLIGHT_CLICK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(500),
  /** Pause between lazy-load scroll steps. */
  UX_PREFLIGHT_SCROLL_PAUSE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(120),
  /** Hard wall-clock budget for the entire lazy-load scroll pass. */
  UX_PREFLIGHT_MAX_SCROLL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(4_000),
  /**
   * When a large overlay survives deterministic clicks, run a scoped Stagehand
   * act() to dismiss cookies / newsletter popups.
   */
  UX_PREFLIGHT_AI_FALLBACK: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  UX_PREFLIGHT_AI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000),

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
