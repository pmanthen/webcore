import type { IssueCategory, IssueSeverity, UxFinding } from "@autonomous-ux/database";
import { describe, expect, it } from "vitest";

import {
  buildExecutiveSummary,
  scoreFindings,
} from "../src/services/scoring.js";

const PENALTY_MIDPOINT = 45;

function finding(
  severity: IssueSeverity,
  category: IssueCategory = "Friction",
): UxFinding {
  return {
    category,
    severity,
    title: `${severity} ${category} issue`,
    description: "Something is wrong.",
    recommendation: "Fix it.",
  };
}

function repeat(severity: IssueSeverity, count: number): UxFinding[] {
  return Array.from({ length: count }, () => finding(severity));
}

describe("scoreFindings", () => {
  it("scores a clean page 100 when there are no findings", () => {
    expect(scoreFindings([])).toBe(100);
  });

  it("matches the hyperbolic formula for a known penalty", () => {
    // One High finding carries a penalty of 10.
    const expected = Math.round(100 / (1 + 10 / PENALTY_MIDPOINT));

    expect(scoreFindings([finding("High")])).toBe(expected);
    expect(scoreFindings([finding("High")])).toBe(82);
  });

  it("scores exactly 50 at the penalty midpoint", () => {
    // 4 High + 1 Medium + 1 Low = 40 + 4 + 1 = 45, the half-penalty point.
    const findings = [...repeat("High", 4), finding("Medium"), finding("Low")];

    expect(scoreFindings(findings)).toBe(50);
  });

  it("weights High above Medium above Low", () => {
    const high = scoreFindings([finding("High")]);
    const medium = scoreFindings([finding("Medium")]);
    const low = scoreFindings([finding("Low")]);

    expect(high).toBeLessThan(medium);
    expect(medium).toBeLessThan(low);
    expect(low).toBeLessThan(100);
  });

  it("decreases monotonically as findings accumulate", () => {
    let previous = scoreFindings([]);

    for (let count = 1; count <= 40; count += 1) {
      const score = scoreFindings(repeat("High", count));
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });

  it("keeps a bad page distinguishable from a catastrophic one", () => {
    // The reason for the curve: straight subtraction would floor both at 0.
    const bad = scoreFindings(repeat("High", 11));
    const catastrophic = scoreFindings(repeat("High", 30));

    expect(bad).toBeGreaterThan(0);
    expect(catastrophic).toBeGreaterThan(0);
    expect(catastrophic).toBeLessThan(bad);
  });

  it("stays within 0–100 for an extreme number of findings", () => {
    const score = scoreFindings(repeat("High", 100_000));

    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns an integer for every input size", () => {
    for (const count of [0, 1, 2, 3, 7, 13, 50]) {
      expect(Number.isInteger(scoreFindings(repeat("Medium", count)))).toBe(true);
    }
  });

  it("clamps unmapped severities onto the scale instead of returning NaN", () => {
    // Rows written before a taxonomy change reach the scorer as plain strings.
    const rogue = [
      { ...finding("Medium"), severity: "sev-1" as IssueSeverity },
      { ...finding("Medium"), severity: "" as IssueSeverity },
    ];

    // Both coerce to Medium, so this must equal two genuine Medium findings.
    expect(scoreFindings(rogue)).toBe(scoreFindings(repeat("Medium", 2)));
    expect(Number.isNaN(scoreFindings(rogue))).toBe(false);
  });

  it("does not throw on findings with a missing severity", () => {
    const malformed = [
      { ...finding("High"), severity: undefined as unknown as IssueSeverity },
      { ...finding("High"), severity: null as unknown as IssueSeverity },
    ];

    expect(() => scoreFindings(malformed)).not.toThrow();
    const score = scoreFindings(malformed);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("buildExecutiveSummary", () => {
  const context = {
    url: "https://example.com/",
    score: 82,
  };

  it("reports a clean audit when there are no findings", () => {
    const summary = buildExecutiveSummary([], { ...context, score: 100 });

    expect(summary).toContain("No heuristic violations");
    expect(summary).toContain("https://example.com/");
    expect(summary).toContain("100/100");
  });

  it("leads with the agent's impression when it returned one", () => {
    const summary = buildExecutiveSummary([finding("High")], {
      ...context,
      overallImpression: "The page buries its primary action",
    });

    expect(summary.startsWith("The page buries its primary action.")).toBe(true);
  });

  it("does not double up terminal punctuation on the impression", () => {
    const summary = buildExecutiveSummary([finding("High")], {
      ...context,
      overallImpression: "The page buries its primary action.",
    });

    expect(summary).not.toContain("action..");
  });

  it("still reads well when the agent returned no impression", () => {
    const summary = buildExecutiveSummary([finding("High")], context);

    expect(summary).toContain("The audit found 1 issue");
    expect(summary).toContain("82/100");
  });

  it("pluralises the issue count", () => {
    expect(buildExecutiveSummary([finding("High")], context)).toContain(
      "1 issue ",
    );
    expect(
      buildExecutiveSummary([finding("High"), finding("Low")], context),
    ).toContain("2 issues ");
  });

  it("names the category carrying the most weight", () => {
    const summary = buildExecutiveSummary(
      [
        finding("High", "Accessibility"),
        finding("Low", "Friction"),
        finding("Low", "Cognitive Load"),
      ],
      context,
    );

    expect(summary).toContain("Accessibility needs attention first.");
  });

  it("omits the severity breakdown for severities with no findings", () => {
    const summary = buildExecutiveSummary([finding("Low")], context);

    expect(summary).toContain("(1 low)");
    expect(summary).not.toContain("0 high");
  });
});
