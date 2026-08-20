import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  type UxEvaluationJobData,
} from "@autonomous-ux/database";
import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getEnv } from "@/lib/env";
import { getEvaluationQueue } from "@/lib/queue";

export const runtime = "nodejs";

const evaluateBodySchema = z.object({
  url: z
    .string()
    .trim()
    .url("A valid URL is required")
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "URL must start with http:// or https://",
    ),
  name: z.string().trim().min(1).max(120).optional(),
});

function deriveProjectName(url: string, explicit?: string): string {
  if (explicit) {
    return explicit;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "Untitled project";
  }
}

async function markEnqueueFailed(
  projectId: string,
  evaluationId: string,
  reason: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { status: "FAILED" },
    }),
    prisma.evaluationFeedback.update({
      where: { id: evaluationId },
      data: {
        summary: `Failed to enqueue evaluation: ${reason}`,
        issues: [],
        rawResponse: { error: reason, phase: "enqueue" },
        jobId: evaluationId,
      },
    }),
  ]);
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = evaluateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { url, name } = parsed.data;
  const env = getEnv();

  let projectId: string | undefined;
  let evaluationId: string | undefined;

  try {
    const client = await prisma.client.upsert({
      where: { email: env.DEMO_CLIENT_EMAIL },
      update: { name: env.DEMO_CLIENT_NAME },
      create: {
        email: env.DEMO_CLIENT_EMAIL,
        name: env.DEMO_CLIENT_NAME,
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          clientId: client.id,
          url,
          name: deriveProjectName(url, name),
          status: "QUEUED",
        },
      });

      // Pre-assign evaluation id so jobId is known before queue.add — avoids a
      // post-enqueue DB write that could return 500 after the job already runs.
      const nextEvaluationId = createId();
      const evaluation = await tx.evaluationFeedback.create({
        data: {
          id: nextEvaluationId,
          projectId: project.id,
          summary: null,
          score: null,
          issues: [],
          jobId: nextEvaluationId,
        },
      });

      return { project, evaluation };
    });

    projectId = result.project.id;
    evaluationId = result.evaluation.id;

    const jobData: UxEvaluationJobData = {
      projectId: result.project.id,
      evaluationId: result.evaluation.id,
      url: result.project.url,
      clientId: client.id,
    };

    try {
      const queue = getEvaluationQueue();
      const job = await queue.add("evaluate", jobData, {
        jobId: result.evaluation.id,
      });

      return NextResponse.json(
        {
          projectId: result.project.id,
          evaluationId: result.evaluation.id,
          jobId: job.id ?? result.evaluation.id,
          status: result.project.status,
          queue: UX_EVALUATION_QUEUE_NAME,
          url: result.project.url,
        },
        { status: 202 },
      );
    } catch (enqueueError) {
      const reason =
        enqueueError instanceof Error
          ? enqueueError.message
          : "Unknown enqueue error";
      console.error("[api/evaluate] enqueue failed", enqueueError);
      await markEnqueueFailed(result.project.id, result.evaluation.id, reason);
      return NextResponse.json(
        { error: "Failed to enqueue evaluation", projectId, evaluationId },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[api/evaluate] failed", error);
    return NextResponse.json(
      {
        error: "Failed to create evaluation",
        ...(projectId ? { projectId } : {}),
        ...(evaluationId ? { evaluationId } : {}),
      },
      { status: 500 },
    );
  }
}
