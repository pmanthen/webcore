import Link from "next/link";

import {
  formatProjectStatus,
  type ProjectListItem,
} from "@/lib/projects";

function statusTone(status: ProjectListItem["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "text-emerald-800 bg-emerald-50";
    case "FAILED":
      return "text-rose-800 bg-rose-50";
    case "RUNNING":
      return "text-sky-800 bg-sky-50";
    case "QUEUED":
      return "text-amber-900 bg-amber-50";
    default:
      return "text-[color:var(--muted)] bg-[color:var(--accent-soft)]";
  }
}

export function ProjectList({ projects }: { projects: ProjectListItem[] }) {
  if (projects.length === 0) {
    return (
      <div className="animate-fade-up py-16 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--ink)]">
          No projects yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[color:var(--muted)]">
          Onboard a URL to queue an autonomous UX evaluation.
        </p>
        <Link
          href="/dashboard/onboard"
          className="mt-6 inline-flex rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          Onboard project
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[color:var(--line)] border-y border-[color:var(--line)]">
      {projects.map((project, index) => (
        <li
          key={project.id}
          className="animate-fade-up flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ animationDelay: `${index * 40}ms` }}
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-[color:var(--ink)]">
              {project.name ?? project.url}
            </p>
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm text-[color:var(--accent)] hover:underline"
            >
              {project.url}
            </a>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${statusTone(project.status)}`}
            >
              {formatProjectStatus(project.status)}
            </span>
            <span className="text-[color:var(--muted)]">
              {project._count.evaluations} eval
              {project._count.evaluations === 1 ? "" : "s"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
