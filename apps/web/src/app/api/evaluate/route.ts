import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  type UxEvaluationJobData,
} from "@autonomous-ux/database";
import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
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
  runId: string,
  reason: string,
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
        summary: `Failed to enqueue evaluation: ${reason}`,
        error: reason,
        finishedAt: new Date(),
        rawResponse: { error: reason, phase: "enqueue" },
        jobId: runId,
      },
    }),
  ]);
}

export async function POST(request: Request) {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!session?.user || !clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let projectId: string | undefined;
  let runId: string | undefined;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          clientId,
          url,
          name: deriveProjectName(url, name),
          status: "QUEUED",
        },
      });

      // Pre-assign the run id so jobId is known before queue.add — avoids a
      // post-enqueue DB write that could return 500 after the job already runs.
      const nextRunId = createId();
      const run = await tx.evaluationRun.create({
        data: {
          id: nextRunId,
          projectId: project.id,
          status: "QUEUED",
          jobId: nextRunId,
        },
      });

      return { project, run };
    });

    projectId = result.project.id;
    runId = result.run.id;

    const jobData: UxEvaluationJobData = {
      projectId: result.project.id,
      runId: result.run.id,
      url: result.project.url,
      clientId,
    };

    try {
      const queue = getEvaluationQueue();
      const job = await queue.add("evaluate", jobData, {
        jobId: result.run.id,
      });

      return NextResponse.json(
        {
          projectId: result.project.id,
          runId: result.run.id,
          jobId: job.id ?? result.run.id,
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
      await markEnqueueFailed(result.project.id, result.run.id, reason);
      return NextResponse.json(
        { error: "Failed to enqueue evaluation", projectId, runId },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[api/evaluate] failed", error);
    return NextResponse.json(
      {
        error: "Failed to create evaluation",
        ...(projectId ? { projectId } : {}),
        ...(runId ? { runId } : {}),
      },
      { status: 500 },
    );
  }
}
