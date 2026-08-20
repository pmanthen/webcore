import {
  prisma,
  type Project,
  type ProjectStatus,
} from "@autonomous-ux/database";

export type ProjectListItem = Pick<
  Project,
  "id" | "name" | "url" | "status" | "createdAt" | "updatedAt"
> & {
  client: { id: string; name: string };
  _count: { runs: number; evaluations: number };
};

export async function listProjects(): Promise<ProjectListItem[]> {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      url: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { id: true, name: true } },
      _count: { select: { runs: true, evaluations: true } },
    },
  });
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function formatProjectStatus(status: ProjectStatus): string {
  return STATUS_LABELS[status];
}
