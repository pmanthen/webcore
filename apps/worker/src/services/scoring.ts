import {
  ISSUE_CATEGORIES,
  summarizeSeverities,
  type IssueSeverity,
  type UxFinding,
} from "@autonomous-ux/database";

/**
 * Penalty per finding. High-severity issues dominate deliberately: a page with
 * one blocking defect should not score well because it is otherwise tidy.
 */
const SEVERITY_PENALTY: Record<IssueSeverity, number> = {
  High: 14,
  Medium: 6,
  Low: 2,
};

/** Aggregate UX score from 0–100. */
export function scoreFindings(findings: readonly UxFinding[]): number {
  const penalty = findings.reduce(
    (total, finding) => total + SEVERITY_PENALTY[finding.severity],
    0,
  );

  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export interface SummaryContext {
  url: string;
  score: number;
  pageType?: string | null;
  primaryGoal?: string | null;
  overallImpression?: string | null;
}

/**
 * Compose the executive summary shown on the results header. The agent's
 * qualitative impression leads; the counts that back it up follow, so the
 * sentence is still useful when the model returns nothing usable.
 */
export function buildExecutiveSummary(
  findings: readonly UxFinding[],
  context: SummaryContext,
): string {
  const parts: string[] = [];

  const impression = context.overallImpression?.trim();
  if (impression) {
    parts.push(impression.endsWith(".") ? impression : `${impression}.`);
  }

  const breakdown = summarizeSeverities(findings);
  if (findings.length === 0) {
    parts.push(
      `No heuristic violations were detected on ${context.url}; the audit scored it ${context.score}/100.`,
    );
    return parts.join(" ");
  }

  const severityParts = (["High", "Medium", "Low"] as const)
    .filter((severity) => breakdown[severity] > 0)
    .map((severity) => `${breakdown[severity]} ${severity.toLowerCase()}`);

  parts.push(
    `The audit found ${formatCount(findings.length, "issue")} (${severityParts.join(
      ", ",
    )}) and scored the page ${context.score}/100.`,
  );

  const worstCategory = ISSUE_CATEGORIES.map((category) => ({
    category,
    weight: findings
      .filter((finding) => finding.category === category)
      .reduce((total, finding) => total + SEVERITY_PENALTY[finding.severity], 0),
  })).sort((a, b) => b.weight - a.weight)[0];

  if (worstCategory && worstCategory.weight > 0) {
    parts.push(`${worstCategory.category} needs attention first.`);
  }

  return parts.join(" ");
}
