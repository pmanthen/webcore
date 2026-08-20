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

function createRedisConnection(): Redis {
  const { REDIS_URL } = getEnv();
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

async function processEvaluationJob(
  job: Job<UxEvaluationJobData>,
): Promise<EvaluationJobResult> {
  const parsed = jobDataSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(
      `Invalid job payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  const { projectId, evaluationId, url } = parsed.data;

  console.info("[worker] starting evaluation", {
    jobId: job.id,
    projectId,
    evaluationId,
    url,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "RUNNING" },
  });

  try {
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
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "FAILED" },
    });

    await prisma.evaluationFeedback.update({
      where: { id: evaluationId },
      data: {
        summary:
          error instanceof Error
            ? `Evaluation failed: ${error.message}`
            : "Evaluation failed",
        issues: [] as Prisma.InputJsonValue,
        rawResponse: {
          error: error instanceof Error ? error.message : String(error),
        } as Prisma.InputJsonValue,
        jobId: job.id ?? evaluationId,
      },
    });

    throw error;
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
    });
  });

  worker.on("completed", (job) => {
    console.info("[worker] job completed", { jobId: job.id });
  });

  return worker;
}
