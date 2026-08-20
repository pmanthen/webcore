import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  type UxEvaluationJobData,
} from "@autonomous-ux/database";
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

      const evaluation = await tx.evaluationFeedback.create({
        data: {
          projectId: project.id,
          summary: null,
          score: null,
          issues: [],
        },
      });

      return { project, evaluation };
    });

    const jobData: UxEvaluationJobData = {
      projectId: result.project.id,
      evaluationId: result.evaluation.id,
      url: result.project.url,
      clientId: client.id,
    };

    const queue = getEvaluationQueue();
    const job = await queue.add("evaluate", jobData, {
      jobId: result.evaluation.id,
    });

    await prisma.evaluationFeedback.update({
      where: { id: result.evaluation.id },
      data: { jobId: job.id ?? result.evaluation.id },
    });

    return NextResponse.json(
      {
        projectId: result.project.id,
        evaluationId: result.evaluation.id,
        jobId: job.id,
        status: result.project.status,
        queue: UX_EVALUATION_QUEUE_NAME,
        url: result.project.url,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[api/evaluate] failed", error);
    return NextResponse.json(
      { error: "Failed to enqueue evaluation" },
      { status: 500 },
    );
  }
}
