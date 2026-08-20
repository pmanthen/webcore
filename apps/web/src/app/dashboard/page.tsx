import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectList } from "@/components/ProjectList";
import { auth } from "@/auth";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!session?.user || !clientId) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  let loadError: string | null = null;

  try {
    projects = await listProjects(clientId);
  } catch (error) {
    console.error("[dashboard] failed to load projects", error);
    loadError =
      "Could not load projects. Ensure Postgres is running and migrations are applied.";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[color:var(--ink)]">
            Projects
          </h1>
          <p className="mt-1 text-[color:var(--muted)]">
            Track onboarded sites and evaluation status.
          </p>
        </div>
        <Link
          href="/dashboard/onboard"
          className="animate-fade-up inline-flex w-fit rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          style={{ animationDelay: "80ms" }}
        >
          Onboard project
        </Link>
      </header>

      {loadError ? (
        <p className="text-sm text-rose-700" role="alert">
          {loadError}
        </p>
      ) : (
        <ProjectList projects={projects} />
      )}
    </div>
  );
}
