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
  BROWSERBASE_API_KEY: z.string().optional(),
  BROWSERBASE_PROJECT_ID: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),

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
