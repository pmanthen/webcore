import type { EvaluationRunStatus } from "@autonomous-ux/database";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockerEvidence } from "@/components/results/BlockerEvidence";
import { FullPagePreview } from "@/components/results/FullPagePreview";
import { ScoreGauge } from "@/components/results/ScoreGauge";
import { TriageBoard } from "@/components/results/TriageBoard";
import { SEVERITY_TONE } from "@/components/results/severity";
import { auth } from "@/auth";
import { getProjectResults } from "@/lib/results";

export const dynamic = "force-dynamic";

const RUN_STATUS_TONE: Record<EvaluationRunStatus, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FAILED: "bg-rose-50 text-rose-800 ring-rose-200",
  FAILED_AT_BLOCKER: "bg-orange-50 text-orange-900 ring-orange-200",
  RUNNING: "bg-sky-50 text-sky-800 ring-sky-200",
  QUEUED: "bg-amber-50 text-amber-900 ring-amber-200",
};

const RUN_STATUS_LABEL: Record<EvaluationRunStatus, string> = {
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  FAILED_AT_BLOCKER: "BLOCKED",
  RUNNING: "RUNNING",
  QUEUED: "QUEUED",
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export default async function ProjectResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!session?.user || !clientId) {
    redirect("/api/auth/signin");
  }

  const { projectId } = await params;
  const { run: requestedRunId } = await searchParams;

  const results = await getProjectResults(projectId, clientId, requestedRunId);
  if (!results) {
    notFound();
  }

  const { project, run, findings, breakdown, history } = results;
  const label = project.name ?? project.url;
  const isBlocked = run?.status === "FAILED_AT_BLOCKER";

  return (
    <div className="space-y-6">
      <header className="animate-fade-up space-y-3">
        <Link
          href="/dashboard"
          className="text-sm text-[color:var(--accent)] transition hover:underline"
        >
          ← All projects
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[color:var(--ink)]">
            {label}
          </h1>
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block break-all text-sm text-[color:var(--accent)] hover:underline"
          >
            {project.url}
          </a>
        </div>
      </header>

      {run ? (
        <section
          className="animate-fade-up rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-5"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {!isBlocked ? (
              <div className="flex items-start gap-5">
                <ScoreGauge score={run.score} />
                {run.screenshotKey ? (
                  <FullPagePreview
                    artifactKey={run.screenshotKey}
                    label={label}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${RUN_STATUS_TONE[run.status]}`}
                >
                  {RUN_STATUS_LABEL[run.status]}
                </span>
                <span className="text-[color:var(--muted)]">
                  {isBlocked ? "Blocked" : "Completed"}{" "}
                  {formatTimestamp(run.finishedAt ?? run.createdAt)} UTC
                </span>
              </div>

              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                  {isBlocked ? "Blocker details" : "Executive summary"}
                </h2>
                <p className="mt-1 leading-relaxed text-[color:var(--ink)]">
                  {run.summary ??
                    (isBlocked
                      ? "The evaluation was blocked by a CAPTCHA or anti-bot protection."
                      : "No summary was recorded for this run.")}
                </p>
              </div>

              {run.error && !isBlocked ? (
                <p
                  className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800"
                  role="alert"
                >
                  {run.error}
                </p>
              ) : null}

              {!isBlocked ? (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-[color:var(--line)] bg-white/70 px-3 py-2">
                    <dt className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
                      Total
                    </dt>
                    <dd className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--ink)]">
                      {findings.length}
                    </dd>
                  </div>
                  {(["High", "Medium", "Low"] as const).map((severity) => (
                    <div
                      key={severity}
                      className={`rounded-md px-3 py-2 ring-1 ring-inset ${SEVERITY_TONE[severity]}`}
                    >
                      <dt className="text-xs uppercase tracking-wide opacity-80">
                        {severity}
                      </dt>
                      <dd className="font-[family-name:var(--font-display)] text-2xl">
                        {breakdown[severity]}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </div>

          {history.length > 1 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[color:var(--line)] pt-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                Runs
              </span>
              {history.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/projects/${project.id}/results?run=${entry.id}`}
                  className={[
                    "rounded-full px-3 py-1 text-xs ring-1 ring-inset transition",
                    entry.id === run.id
                      ? "bg-[color:var(--accent)] text-white ring-[color:var(--accent)]"
                      : "bg-white/70 text-[color:var(--muted)] ring-[color:var(--line)] hover:text-[color:var(--ink)]",
                  ].join(" ")}
                >
                  {formatTimestamp(entry.createdAt)}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-[color:var(--line)] px-4 py-12 text-center text-[color:var(--muted)]">
          No evaluation runs yet for this project.
        </p>
      )}

      {run && isBlocked ? (
        <BlockerEvidence
          artifactKey={run.screenshotKey}
          label={label}
          summary={run.summary}
        />
      ) : null}

      {run && !isBlocked ? <TriageBoard findings={findings} /> : null}
    </div>
  );
}
