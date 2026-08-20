import type {
  EvaluationRunResult,
  UxFinding,
} from "@autonomous-ux/database";

/**
 * Deterministic placeholder findings used when `UX_EVALUATION_MODE=mock`, so the
 * queue, database, and dashboard can be exercised without an LLM or a browser.
 */
export function buildMockEvaluationResult(
  url: string,
  extras?: {
    observedActions?: unknown[];
    mode?: "mock" | "live";
    note?: string;
    screenshotKey?: string | null;
    screenshotUrl?: string | null;
  },
): EvaluationRunResult {
  const findings: UxFinding[] = [
    {
      category: "Accessibility",
      severity: "High",
      title: "Hero image is missing alternative text",
      description:
        "The primary hero image exposes no accessible name, so screen reader users get no context for the page's main message.",
      recommendation:
        'Add a descriptive alt attribute (or alt="" if purely decorative) to the hero image.',
      elementSelector: "main img",
      pageUrl: url,
    },
    {
      category: "Cognitive Load",
      severity: "Medium",
      title: "Three competing calls to action above the fold",
      description:
        "Multiple primary-styled buttons compete for attention in the hero area, leaving no obvious next step.",
      recommendation:
        "Promote a single primary action and demote the others to secondary or tertiary styling.",
      elementSelector: "main a.btn, main button",
      pageUrl: url,
    },
    {
      category: "Friction",
      severity: "Low",
      title: "Signup form gives no inline validation",
      description:
        "The email field only reports problems after submission, so users discover mistakes late.",
      recommendation:
        "Validate the email field on blur and describe the error next to the input via aria-describedby.",
      elementSelector: 'form input[type="email"]',
      pageUrl: url,
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
    findings,
    screenshotKey: extras?.screenshotKey ?? null,
    screenshotUrl: extras?.screenshotUrl ?? null,
    rawResponse: {
      mode,
      url,
      observedActions: extras?.observedActions ?? [],
      generatedAt: new Date().toISOString(),
    },
  };
}
