import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /**
   * Demo tenant used until auth lands. Projects are attached to this client.
   */
  DEMO_CLIENT_EMAIL: z.string().email().default("demo@uxeval.local"),
  DEMO_CLIENT_NAME: z.string().min(1).default("Demo Client"),
});

export type WebEnv = z.infer<typeof envSchema>;

let cached: WebEnv | null = null;

export function getEnv(): WebEnv {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    NODE_ENV: process.env.NODE_ENV,
    DEMO_CLIENT_EMAIL: process.env.DEMO_CLIENT_EMAIL,
    DEMO_CLIENT_NAME: process.env.DEMO_CLIENT_NAME,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}
