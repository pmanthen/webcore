import {
  normalizeCategory,
  normalizeSeverity,
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  type UxEvaluationJobData,
  type UxFinding,
} from "@autonomous-ux/database";
import { Prisma } from "@prisma/client";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

import { getEnv } from "../env.js";
import { runUxEvaluation } from "../services/ux-evaluation.js";

const jobDataSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
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
  runId: string,
  jobId: string | undefined,
  message: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { status: "FAILED" },
    }),
    prisma.evaluationRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        summary: `Evaluation failed: ${message}`,
        error: message,
        finishedAt: new Date(),
        rawResponse: { error: message } as Prisma.InputJsonValue,
        jobId: jobId ?? runId,
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
    typeof record.runId !== "string"
  ) {
    return;
  }

  try {
    await markEvaluationFailed(record.projectId, record.runId, jobId, message);
  } catch (error) {
    console.error("[worker] failed to persist FAILED status", error);
  }
}

async function assertJobOwnership(data: ParsedJobData): Promise<void> {
  const run = await prisma.evaluationRun.findUnique({
    where: { id: data.runId },
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, clientId: true } },
    },
  });

  if (!run) {
    throw new Error(`Evaluation run ${data.runId} not found`);
  }

  if (run.projectId !== data.projectId) {
    throw new Error(
      `Evaluation run ${data.runId} does not belong to project ${data.projectId}`,
    );
  }

  if (run.project.clientId !== data.clientId) {
    throw new Error(
      `Project ${data.projectId} does not belong to client ${data.clientId}`,
    );
  }
}

function toFeedbackRows(
  findings: readonly UxFinding[],
  projectId: string,
  runId: string,
): Prisma.EvaluationFeedbackCreateManyInput[] {
  return findings.map((finding) => ({
    projectId,
    runId,
    category: normalizeCategory(finding.category),
    severity: normalizeSeverity(finding.severity),
    title: finding.title,
    description: finding.description,
    recommendation: finding.recommendation,
    elementSelector: finding.elementSelector ?? null,
    pageUrl: finding.pageUrl ?? null,
    screenshotKey: finding.screenshotKey ?? null,
    screenshotUrl: finding.screenshotUrl ?? null,
  }));
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

  const { projectId, runId, url } = parsed.data;

  console.info("[worker] starting evaluation", {
    jobId: job.id,
    projectId,
    runId,
    url,
    attempt: job.attemptsMade + 1,
  });

  try {
    await assertJobOwnership(parsed.data);

    await prisma.$transaction([
      prisma.project.update({
        where: { id: projectId },
        data: { status: "RUNNING" },
      }),
      prisma.evaluationRun.update({
        where: { id: runId },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          error: null,
          jobId: job.id ?? runId,
        },
      }),
    ]);

    const result = await runUxEvaluation(url, { runId });

    await prisma.$transaction([
      // Retries re-run the audit from scratch, so clear findings from the
      // previous attempt instead of accumulating duplicates.
      prisma.evaluationFeedback.deleteMany({ where: { runId } }),
      prisma.evaluationFeedback.createMany({
        data: toFeedbackRows(result.findings, projectId, runId),
      }),
      prisma.evaluationRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          summary: result.summary,
          score: result.score,
          screenshotKey: result.screenshotKey ?? null,
          screenshotUrl: result.screenshotUrl ?? null,
          rawResponse: (result.rawResponse ??
            Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          jobId: job.id ?? runId,
          finishedAt: new Date(),
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
      findingCount: result.findings.length,
      score: result.score,
    });

    return {
      projectId,
      runId,
      findingCount: result.findings.length,
      score: result.score,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Evaluation failed";

    // Only persist FAILED on the last attempt so retries can recover cleanly.
    if (isFinalAttempt(job)) {
      await markEvaluationFailed(projectId, runId, job.id, message);
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
  runId: string;
  findingCount: number;
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
