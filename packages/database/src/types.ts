/**
 * Shared domain types for the Autonomous UX Evaluation platform.
 * Both Next.js (`apps/web`) and the BullMQ worker (`apps/worker`) import these.
 */

import type {
  Account,
  Client,
  EvaluationFeedback,
  EvaluationRun,
  EvaluationRunStatus,
  Project,
  ProjectStatus,
  Session,
  User,
  VerificationToken,
} from "@prisma/client";

export type {
  Account,
  Client,
  EvaluationFeedback,
  EvaluationRun,
  EvaluationRunStatus,
  Project,
  ProjectStatus,
  Session,
  User,
  VerificationToken,
};

/**
 * Severity of a single UX finding, stored as a plain string on
 * `EvaluationFeedback.severity` so LLM output can be persisted without a
 * migration whenever the taxonomy is tuned.
 */
export type IssueSeverity = "Low" | "Medium" | "High";

/** Heuristic buckets the Stagehand audit reports against. */
export type IssueCategory = "Accessibility" | "Cognitive Load" | "Friction";

export const ISSUE_SEVERITIES: readonly IssueSeverity[] = [
  "High",
  "Medium",
  "Low",
];

export const ISSUE_CATEGORIES: readonly IssueCategory[] = [
  "Accessibility",
  "Cognitive Load",
  "Friction",
];

/** Sort weight so High-severity findings surface first in the triage list. */
export const SEVERITY_RANK: Record<IssueSeverity, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export function isIssueSeverity(value: unknown): value is IssueSeverity {
  return (
    typeof value === "string" &&
    ISSUE_SEVERITIES.includes(value as IssueSeverity)
  );
}

export function isIssueCategory(value: unknown): value is IssueCategory {
  return (
    typeof value === "string" &&
    ISSUE_CATEGORIES.includes(value as IssueCategory)
  );
}

/**
 * Coerce a free-form severity string (LLM output, legacy row) into the
 * canonical set. Unknown values fall back to `Medium` rather than throwing so a
 * single odd finding never fails a whole audit.
 */
export function normalizeSeverity(value: unknown): IssueSeverity {
  if (typeof value !== "string") {
    return "Medium";
  }

  switch (value.trim().toLowerCase()) {
    case "high":
    case "critical":
    case "blocker":
      return "High";
    case "low":
    case "minor":
    case "suggestion":
      return "Low";
    default:
      return "Medium";
  }
}

/** Coerce a free-form category string into the canonical set. */
export function normalizeCategory(value: unknown): IssueCategory {
  if (typeof value !== "string") {
    return "Friction";
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (normalized.startsWith("access") || normalized === "a11y") {
    return "Accessibility";
  }
  if (normalized.includes("cognitive") || normalized.includes("load")) {
    return "Cognitive Load";
  }
  return "Friction";
}

/**
 * A single UX finding as produced by the agent, before it becomes an
 * `EvaluationFeedback` row.
 */
export interface UxFinding {
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  /** CSS selector, ARIA role, or other locator when available. */
  elementSelector?: string | null;
  /** Page URL where the issue was observed (may differ from the project root). */
  pageUrl?: string | null;
  /** MinIO object key for the screenshot evidencing this finding. */
  screenshotKey?: string | null;
  /** Browsable URL derived from `screenshotKey`. */
  screenshotUrl?: string | null;
}

/** Payload written by the worker when an audit run completes. */
export interface EvaluationRunResult {
  summary: string;
  score: number | null;
  findings: UxFinding[];
  /** Full-page screenshot for the run. */
  screenshotKey?: string | null;
  screenshotUrl?: string | null;
  rawResponse?: Record<string, unknown>;
}

/** Job data enqueued by the web API onto the BullMQ `ux-evaluation` queue. */
export interface UxEvaluationJobData {
  projectId: string;
  /** `EvaluationRun.id` — also used as the BullMQ job id. */
  runId: string;
  url: string;
  clientId: string;
}

export const UX_EVALUATION_QUEUE_NAME = "ux-evaluation" as const;

/** Project with its owning client (common dashboard / API shape). */
export type ProjectWithClient = Project & {
  client: Client;
};

/** Project with audit run history. */
export type ProjectWithRuns = Project & {
  runs: EvaluationRun[];
};

/** An audit run together with the findings it produced. */
export type EvaluationRunWithFindings = EvaluationRun & {
  findings: EvaluationFeedback[];
};

/**
 * `EvaluationFeedback` narrowed to the canonical category/severity unions, which
 * Prisma models as plain `string`.
 */
export type TypedEvaluationFeedback = Omit<
  EvaluationFeedback,
  "category" | "severity"
> & {
  category: IssueCategory;
  severity: IssueSeverity;
};

/** Narrow raw rows from Prisma into findings with canonical enums. */
export function toTypedFeedback(
  row: EvaluationFeedback,
): TypedEvaluationFeedback {
  return {
    ...row,
    category: normalizeCategory(row.category),
    severity: normalizeSeverity(row.severity),
  };
}

/** Count of findings per severity, used by the dashboard summary cards. */
export type SeverityBreakdown = Record<IssueSeverity, number>;

export function summarizeSeverities(
  findings: readonly { severity: string }[],
): SeverityBreakdown {
  const breakdown: SeverityBreakdown = { High: 0, Medium: 0, Low: 0 };
  for (const finding of findings) {
    breakdown[normalizeSeverity(finding.severity)] += 1;
  }
  return breakdown;
}
