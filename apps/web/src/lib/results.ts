import {
  SEVERITY_RANK,
  prisma,
  summarizeSeverities,
  toTypedFeedback,
  type EvaluationRunStatus,
  type IssueCategory,
  type IssueSeverity,
  type SeverityBreakdown,
} from "@autonomous-ux/database";

/** One finding, flattened for the client-side triage components. */
export interface FindingView {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  elementSelector: string | null;
  pageUrl: string | null;
  screenshotKey: string | null;
}

export interface RunView {
  id: string;
  status: EvaluationRunStatus;
  summary: string | null;
  score: number | null;
  screenshotKey: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ProjectResultsView {
  project: {
    id: string;
    name: string | null;
    url: string;
    status: string;
    clientName: string;
  };
  run: RunView | null;
  /** Earlier runs for the same project, newest first. */
  history: { id: string; status: EvaluationRunStatus; createdAt: string }[];
  findings: FindingView[];
  breakdown: SeverityBreakdown;
}

/**
 * Load a project's latest audit (or a specific run) with its findings.
 * Returns `null` when the project does not exist **for this tenant**, so
 * callers cannot IDOR across `clientId` boundaries.
 */
export async function getProjectResults(
  projectId: string,
  clientId: string,
  runId?: string,
): Promise<ProjectResultsView | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId },
    select: {
      id: true,
      name: true,
      url: true,
      status: true,
      client: { select: { name: true } },
      runs: {
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true },
      },
    },
  });

  if (!project) {
    return null;
  }

  const targetRunId = runId ?? project.runs[0]?.id;

  const run = targetRunId
    ? await prisma.evaluationRun.findFirst({
        where: { id: targetRunId, projectId },
        include: {
          findings: {
            orderBy: [{ category: "asc" }, { createdAt: "asc" }],
          },
        },
      })
    : null;

  const findings: FindingView[] = (run?.findings ?? [])
    .map(toTypedFeedback)
    .map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      recommendation: finding.recommendation,
      elementSelector: finding.elementSelector,
      pageUrl: finding.pageUrl,
      screenshotKey: finding.screenshotKey,
    }))
    // Worst first: severity, then category for a stable order within a severity.
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.category.localeCompare(b.category),
    );

  return {
    project: {
      id: project.id,
      name: project.name,
      url: project.url,
      status: project.status,
      clientName: project.client.name,
    },
    run: run
      ? {
          id: run.id,
          status: run.status,
          summary: run.summary,
          score: run.score,
          screenshotKey: run.screenshotKey,
          error: run.error,
          startedAt: run.startedAt?.toISOString() ?? null,
          finishedAt: run.finishedAt?.toISOString() ?? null,
          createdAt: run.createdAt.toISOString(),
        }
      : null,
    history: project.runs.map((entry) => ({
      id: entry.id,
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
    })),
    findings,
    breakdown: summarizeSeverities(findings),
  };
}
