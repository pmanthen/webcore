import type { EvaluationResultPayload, UxIssue } from "@autonomous-ux/database";

/**
 * Deterministic placeholder findings used while the Stagehand agent is a skeleton.
 * The worker always persists a payload shaped like production output.
 */
export function buildMockEvaluationResult(
  url: string,
  extras?: {
    observedActions?: unknown[];
    mode?: "mock" | "live";
    note?: string;
  },
): EvaluationResultPayload {
  const issues: UxIssue[] = [
    {
      id: "mock-contrast-hero",
      title: "Low contrast on primary call-to-action",
      description:
        "The main CTA text may not meet WCAG AA contrast against its background on first paint.",
      severity: "major",
      category: "accessibility",
      pageUrl: url,
      selector: "main a[href], main button",
      recommendation:
        "Increase CTA contrast to at least 4.5:1 and verify focus styles.",
    },
    {
      id: "mock-nav-landmarks",
      title: "Missing clear navigation landmark",
      description:
        "Primary navigation is difficult to identify programmatically for assistive tech.",
      severity: "minor",
      category: "navigation",
      pageUrl: url,
      recommendation:
        "Wrap primary links in <nav aria-label=\"Primary\"> or equivalent.",
    },
    {
      id: "mock-mobile-tap",
      title: "Tight tap targets in header actions",
      description:
        "Header action controls appear smaller than the recommended 44×44 CSS px hit area.",
      severity: "suggestion",
      category: "mobile",
      pageUrl: url,
      recommendation: "Increase padding/hit area for header icon buttons.",
    },
  ];

  const mode = extras?.mode ?? "mock";
  const note =
    extras?.note ??
    (mode === "mock"
      ? "Mock evaluation — Stagehand live mode not enabled."
      : "Live Stagehand pass completed; findings are scaffold placeholders.");

  return {
    summary: `${note} Reviewed ${url}.`,
    score: 72,
    issues,
    rawResponse: {
      mode,
      url,
      observedActions: extras?.observedActions ?? [],
      generatedAt: new Date().toISOString(),
    },
  };
}
