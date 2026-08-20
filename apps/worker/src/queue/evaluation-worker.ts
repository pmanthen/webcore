import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  type UxEvaluationJobData,
} from "@autonomous-ux/database";
import { Prisma } from "@prisma/client";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

import { getEnv } from "../env.js";
import { runUxEvaluation } from "../services/ux-evaluation.js";

const jobDataSchema = z.object({
  projectId: z.string().min(1),
  evaluationId: z.string().min(1),
  url: z.string().url(),
  clientId: z.string().min(1),
});

type ParsedJobData = z.infer<typeof jobDataSchema>;

function createRedisConnection(): Redis {
  const { REDIS_URL } = getEnv();
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

/**
 * True when this failure will not be retried.
 * @param phase `process` — inside the worker processor (attemptsMade not yet incremented).
 *              `failed` — inside the `failed` event (attemptsMade already incremented).
 */
function isFinalAttempt(
  job: Job,
  phase: "process" | "failed" = "process",
): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  if (phase === "failed") {
    return job.attemptsMade >= maxAttempts;
  }
  return job.attemptsMade + 1 >= maxAttempts;
}

async function markEvaluationFailed(
  projectId: string,
  evaluationId: string,
  jobId: string | undefined,
  message: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { status: "FAILED" },
    }),
    prisma.evaluationFeedback.update({
      where: { id: evaluationId },
      data: {
        summary: `Evaluation failed: ${message}`,
        issues: [] as Prisma.InputJsonValue,
        rawResponse: {
          error: message,
        } as Prisma.InputJsonValue,
        jobId: jobId ?? evaluationId,
      },
    }),
  ]);
}

/**
 * Best-effort FAILED update from raw job data (validation / final failure paths).
 */
async function markFailedFromUnknownJobData(
  data: unknown,
  jobId: string | undefined,
  message: string,
): Promise<void> {
  if (!data || typeof data !== "object") {
    return;
  }

  const record = data as Record<string, unknown>;
  if (
    typeof record.projectId !== "string" ||
    typeof record.evaluationId !== "string"
  ) {
    return;
  }

  try {
    await markEvaluationFailed(
      record.projectId,
      record.evaluationId,
      jobId,
      message,
    );
  } catch (error) {
    console.error("[worker] failed to persist FAILED status", error);
  }
}

async function assertJobOwnership(data: ParsedJobData): Promise<void> {
  const evaluation = await prisma.evaluationFeedback.findUnique({
    where: { id: data.evaluationId },
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, clientId: true } },
    },
  });

  if (!evaluation) {
    throw new Error(`Evaluation ${data.evaluationId} not found`);
  }

  if (evaluation.projectId !== data.projectId) {
    throw new Error(
      `Evaluation ${data.evaluationId} does not belong to project ${data.projectId}`,
    );
  }

  if (evaluation.project.clientId !== data.clientId) {
    throw new Error(
      `Project ${data.projectId} does not belong to client ${data.clientId}`,
    );
  }
}

async function processEvaluationJob(
  job: Job<UxEvaluationJobData>,
): Promise<EvaluationJobResult> {
  const parsed = jobDataSchema.safeParse(job.data);
  if (!parsed.success) {
    const message = `Invalid job payload: ${parsed.error.issues
      .map((issue) => issue.message)
      .join(", ")}`;

    if (isFinalAttempt(job)) {
      await markFailedFromUnknownJobData(job.data, job.id, message);
    }

    throw new Error(message);
  }

  const { projectId, evaluationId, url } = parsed.data;

  console.info("[worker] starting evaluation", {
    jobId: job.id,
    projectId,
    evaluationId,
    url,
    attempt: job.attemptsMade + 1,
  });

  try {
    await assertJobOwnership(parsed.data);

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "RUNNING" },
    });

    const result = await runUxEvaluation(url);

    await prisma.$transaction([
      prisma.evaluationFeedback.update({
        where: { id: evaluationId },
        data: {
          summary: result.summary,
          score: result.score,
          issues: result.issues as unknown as Prisma.InputJsonValue,
          rawResponse: (result.rawResponse ??
            Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          jobId: job.id ?? evaluationId,
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { status: "COMPLETED" },
      }),
    ]);

    console.info("[worker] evaluation completed", {
      jobId: job.id,
      projectId,
      issueCount: result.issues.length,
      score: result.score,
    });

    return {
      projectId,
      evaluationId,
      issueCount: result.issues.length,
      score: result.score,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Evaluation failed";

    // Only persist FAILED on the last attempt so retries can recover cleanly.
    if (isFinalAttempt(job)) {
      await markEvaluationFailed(projectId, evaluationId, job.id, message);
    } else {
      console.warn("[worker] attempt failed; will retry", {
        jobId: job.id,
        projectId,
        attempt: job.attemptsMade + 1,
        message,
      });
    }

    throw error instanceof Error ? error : new Error(message);
  }
}

interface EvaluationJobResult {
  projectId: string;
  evaluationId: string;
  issueCount: number;
  score: number | null;
}

export function startEvaluationWorker(): Worker<
  UxEvaluationJobData,
  EvaluationJobResult
> {
  const env = getEnv();
  const connection = createRedisConnection();

  const worker = new Worker<UxEvaluationJobData, EvaluationJobResult>(
    UX_EVALUATION_QUEUE_NAME,
    (job) => processEvaluationJob(job),
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on("ready", () => {
    console.info("[worker] listening", {
      queue: UX_EVALUATION_QUEUE_NAME,
      mode: env.UX_EVALUATION_MODE,
      concurrency: env.WORKER_CONCURRENCY,
    });
  });

  worker.on("failed", (job, error) => {
    console.error("[worker] job failed", {
      jobId: job?.id,
      error: error.message,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
    });

    // Safety net for cases where the processor could not mark FAILED
    // (e.g. crash after throw, or validation with partial IDs).
    if (job && isFinalAttempt(job, "failed")) {
      void markFailedFromUnknownJobData(job.data, job.id, error.message);
    }
  });

  worker.on("completed", (job) => {
    console.info("[worker] job completed", { jobId: job.id });
  });

  return worker;
}
