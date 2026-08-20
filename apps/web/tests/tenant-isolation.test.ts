import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstProject = vi.fn();
const findFirstRun = vi.fn();
const findManyProjects = vi.fn();

vi.mock("@autonomous-ux/database", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@autonomous-ux/database")>();
  return {
    ...actual,
    prisma: {
      project: {
        findFirst: (...args: unknown[]) => findFirstProject(...args),
        findMany: (...args: unknown[]) => findManyProjects(...args),
      },
      evaluationRun: {
        findFirst: (...args: unknown[]) => findFirstRun(...args),
      },
    },
  };
});

import { listProjects } from "@/lib/projects";
import { getProjectResults } from "@/lib/results";

const TENANT_A = "client_tenant_a";
const TENANT_B = "client_tenant_b";
const PROJECT_A = "project_owned_by_a";

const projectOwnedByA = {
  id: PROJECT_A,
  name: "Tenant A Site",
  url: "https://a.example.com",
  status: "COMPLETED",
  client: { name: "Tenant A" },
  runs: [
    {
      id: "run_a1",
      status: "COMPLETED" as const,
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    },
  ],
};

const runWithFindings = {
  id: "run_a1",
  status: "COMPLETED" as const,
  summary: "Secret findings for Tenant A only",
  score: 72,
  screenshotKey: "runs/run_a1/full-page.png",
  error: null,
  startedAt: new Date("2026-08-01T12:00:00.000Z"),
  finishedAt: new Date("2026-08-01T12:01:00.000Z"),
  createdAt: new Date("2026-08-01T12:00:00.000Z"),
  findings: [
    {
      id: "finding_1",
      projectId: PROJECT_A,
      runId: "run_a1",
      category: "Accessibility",
      severity: "High",
      title: "Missing alt text",
      description: "Hero image has no alt attribute",
      recommendation: "Add descriptive alt text",
      screenshotUrl: null,
      screenshotKey: null,
      elementSelector: "img.hero",
      pageUrl: "https://a.example.com",
      createdAt: new Date("2026-08-01T12:01:00.000Z"),
      updatedAt: new Date("2026-08-01T12:01:00.000Z"),
    },
  ],
};

describe("getProjectResults tenant isolation (IDOR)", () => {
  beforeEach(() => {
    findFirstProject.mockReset();
    findFirstRun.mockReset();
    findManyProjects.mockReset();
  });

  it("returns null when Tenant B queries Tenant A's project id", async () => {
    // Prisma `where: { id, clientId }` yields no row for the wrong tenant.
    findFirstProject.mockResolvedValue(null);

    const result = await getProjectResults(PROJECT_A, TENANT_B);

    expect(result).toBeNull();
    expect(findFirstProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_A, clientId: TENANT_B },
      }),
    );
    expect(findFirstRun).not.toHaveBeenCalled();
  });

  it("does not expose findings to a foreign tenant", async () => {
    findFirstProject.mockResolvedValue(null);

    const result = await getProjectResults(PROJECT_A, TENANT_B);

    expect(result).toBeNull();
    expect(result?.findings).toBeUndefined();
  });

  it("returns results when the owning tenant queries their project", async () => {
    findFirstProject.mockResolvedValue(projectOwnedByA);
    findFirstRun.mockResolvedValue(runWithFindings);

    const result = await getProjectResults(PROJECT_A, TENANT_A);

    expect(findFirstProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_A, clientId: TENANT_A },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.project.id).toBe(PROJECT_A);
    expect(result?.project.clientName).toBe("Tenant A");
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]?.title).toBe("Missing alt text");
    expect(result?.run?.summary).toContain("Tenant A");
  });
});

describe("listProjects tenant scoping", () => {
  beforeEach(() => {
    findManyProjects.mockReset();
  });

  it("restricts the query to session.user.clientId", async () => {
    findManyProjects.mockResolvedValue([]);

    await listProjects(TENANT_A);

    expect(findManyProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: TENANT_A },
      }),
    );
  });
});
