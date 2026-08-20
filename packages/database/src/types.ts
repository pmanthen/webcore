/**
 * Shared domain types for the Autonomous UX Evaluation platform.
 * Both Next.js (`apps/web`) and the BullMQ worker (`apps/worker`) import these.
 */

import type {
  Client,
  EvaluationFeedback,
  Project,
  ProjectStatus,
} from "@prisma/client";

export type {
  Client,
  EvaluationFeedback,
  Project,
  ProjectStatus,
};

/** Severity of a single UX finding. */
export type UxIssueSeverity = "critical" | "major" | "minor" | "suggestion";

/** Category used to group UX findings in the UI and reports. */
export type UxIssueCategory =
  | "accessibility"
  | "usability"
  | "visual_design"
  | "performance"
  | "content"
  | "navigation"
  | "forms"
  | "mobile"
  | "other";

/**
 * A single UX issue identified by the AI agent.
 * Stored in `EvaluationFeedback.issues` as a JSON array.
 */
export interface UxIssue {
  id: string;
  title: string;
  description: string;
  severity: UxIssueSeverity;
  category: UxIssueCategory;
  /** CSS selector, ARIA role, or other locator when available. */
  selector?: string;
  /** Page URL where the issue was observed (may differ from project root URL). */
  pageUrl?: string;
  recommendation?: string;
}

/** Payload written by the worker when an evaluation completes. */
export interface EvaluationResultPayload {
  summary: string;
  score: number | null;
  issues: UxIssue[];
  rawResponse?: Record<string, unknown>;
}

/** Job data enqueued by the web API onto the BullMQ `ux-evaluation` queue. */
export interface UxEvaluationJobData {
  projectId: string;
  evaluationId: string;
  url: string;
  clientId: string;
}

export const UX_EVALUATION_QUEUE_NAME = "ux-evaluation" as const;

/** Project with its owning client (common dashboard / API shape). */
export type ProjectWithClient = Project & {
  client: Client;
};

/** Project with evaluation history. */
export type ProjectWithEvaluations = Project & {
  evaluations: EvaluationFeedback[];
};

/** Evaluation feedback with parsed, typed issues. */
export interface EvaluationFeedbackWithIssues
  extends Omit<EvaluationFeedback, "issues"> {
  issues: UxIssue[];
}

/**
 * Narrow unknown JSON from Prisma into typed UX issues.
 * Invalid entries are dropped rather than throwing, so API responses stay resilient.
 */
export function parseUxIssues(value: unknown): UxIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const severities: readonly UxIssueSeverity[] = [
    "critical",
    "major",
    "minor",
    "suggestion",
  ];
  const categories: readonly UxIssueCategory[] = [
    "accessibility",
    "usability",
    "visual_design",
    "performance",
    "content",
    "navigation",
    "forms",
    "mobile",
    "other",
  ];

  const issues: UxIssue[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const severity = record.severity;
    const category = record.category;

    if (
      typeof record.id !== "string" ||
      typeof record.title !== "string" ||
      typeof record.description !== "string" ||
      typeof severity !== "string" ||
      typeof category !== "string" ||
      !severities.includes(severity as UxIssueSeverity) ||
      !categories.includes(category as UxIssueCategory)
    ) {
      continue;
    }

    const issue: UxIssue = {
      id: record.id,
      title: record.title,
      description: record.description,
      severity: severity as UxIssueSeverity,
      category: category as UxIssueCategory,
    };

    if (typeof record.selector === "string") {
      issue.selector = record.selector;
    }
    if (typeof record.pageUrl === "string") {
      issue.pageUrl = record.pageUrl;
    }
    if (typeof record.recommendation === "string") {
      issue.recommendation = record.recommendation;
    }

    issues.push(issue);
  }

  return issues;
}
