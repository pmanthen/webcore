import { describe, expect, it } from "vitest";

import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  isIssueCategory,
  isIssueSeverity,
  normalizeCategory,
  normalizeSeverity,
  summarizeSeverities,
  toTypedFeedback,
} from "../src/types.js";
import type { EvaluationFeedback } from "../src/types.js";

describe("isIssueSeverity", () => {
  it("accepts every canonical severity", () => {
    for (const severity of ISSUE_SEVERITIES) {
      expect(isIssueSeverity(severity)).toBe(true);
    }
  });

  it("rejects near misses and non-strings", () => {
    for (const value of ["high", "Critical", "", null, undefined, 3, {}]) {
      expect(isIssueSeverity(value)).toBe(false);
    }
  });
});

describe("isIssueCategory", () => {
  it("accepts every canonical category", () => {
    for (const category of ISSUE_CATEGORIES) {
      expect(isIssueCategory(category)).toBe(true);
    }
  });

  it("rejects near misses and non-strings", () => {
    for (const value of ["accessibility", "a11y", null, undefined, 7]) {
      expect(isIssueCategory(value)).toBe(false);
    }
  });
});

describe("normalizeSeverity", () => {
  it("passes canonical severities through unchanged", () => {
    expect(normalizeSeverity("High")).toBe("High");
    expect(normalizeSeverity("Medium")).toBe("Medium");
    expect(normalizeSeverity("Low")).toBe("Low");
  });

  it("folds the synonyms an LLM reaches for onto the scale", () => {
    expect(normalizeSeverity("critical")).toBe("High");
    expect(normalizeSeverity("BLOCKER")).toBe("High");
    expect(normalizeSeverity("minor")).toBe("Low");
    expect(normalizeSeverity("suggestion")).toBe("Low");
  });

  it("ignores surrounding whitespace and casing", () => {
    expect(normalizeSeverity("  hIgH \n")).toBe("High");
    expect(normalizeSeverity("\tLOW")).toBe("Low");
  });

  it("defaults unmapped strings to Medium rather than throwing", () => {
    for (const value of ["catastrophic", "sev-1", "", "   ", "🔥"]) {
      expect(() => normalizeSeverity(value)).not.toThrow();
      expect(normalizeSeverity(value)).toBe("Medium");
    }
  });

  it("defaults non-string input to Medium rather than throwing", () => {
    for (const value of [null, undefined, 42, {}, [], Number.NaN, () => "High"]) {
      expect(() => normalizeSeverity(value)).not.toThrow();
      expect(normalizeSeverity(value)).toBe("Medium");
    }
  });

  it("always returns a value inside the canonical set", () => {
    for (const value of ["High", "nonsense", null, 0, Symbol("x").toString()]) {
      expect(ISSUE_SEVERITIES).toContain(normalizeSeverity(value));
    }
  });
});

describe("normalizeCategory", () => {
  it("passes canonical categories through unchanged", () => {
    expect(normalizeCategory("Accessibility")).toBe("Accessibility");
    expect(normalizeCategory("Cognitive Load")).toBe("Cognitive Load");
    expect(normalizeCategory("Friction")).toBe("Friction");
  });

  it("recognises accessibility by prefix and by the a11y numeronym", () => {
    expect(normalizeCategory("accessible")).toBe("Accessibility");
    expect(normalizeCategory("ACCESS")).toBe("Accessibility");
    expect(normalizeCategory("a11y")).toBe("Accessibility");
  });

  it("collapses separators before matching", () => {
    expect(normalizeCategory("cognitive_load")).toBe("Cognitive Load");
    expect(normalizeCategory("cognitive-load")).toBe("Cognitive Load");
    expect(normalizeCategory("  Cognitive   Load  ")).toBe("Cognitive Load");
  });

  it("defaults unmapped strings to Friction rather than throwing", () => {
    for (const value of ["performance", "seo", "", "   "]) {
      expect(() => normalizeCategory(value)).not.toThrow();
      expect(normalizeCategory(value)).toBe("Friction");
    }
  });

  it("defaults non-string input to Friction rather than throwing", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(() => normalizeCategory(value)).not.toThrow();
      expect(normalizeCategory(value)).toBe("Friction");
    }
  });

  it("always returns a value inside the canonical set", () => {
    for (const value of ["a11y", "nonsense", null, 0]) {
      expect(ISSUE_CATEGORIES).toContain(normalizeCategory(value));
    }
  });
});

describe("summarizeSeverities", () => {
  it("returns a zeroed breakdown for no findings", () => {
    expect(summarizeSeverities([])).toEqual({ High: 0, Medium: 0, Low: 0 });
  });

  it("counts canonical severities", () => {
    expect(
      summarizeSeverities([
        { severity: "High" },
        { severity: "High" },
        { severity: "Low" },
      ]),
    ).toEqual({ High: 2, Medium: 0, Low: 1 });
  });

  it("buckets unmapped severities into Medium instead of dropping them", () => {
    const breakdown = summarizeSeverities([
      { severity: "critical" },
      { severity: "sev-3" },
      { severity: "" },
    ]);

    expect(breakdown).toEqual({ High: 1, Medium: 2, Low: 0 });
    const total = breakdown.High + breakdown.Medium + breakdown.Low;
    expect(total).toBe(3);
  });
});

describe("toTypedFeedback", () => {
  const row: EvaluationFeedback = {
    id: "fb_1",
    projectId: "prj_1",
    runId: "run_1",
    category: "cognitive-load",
    severity: "blocker",
    title: "Two competing primary CTAs",
    description: "The hero offers two equally weighted actions.",
    recommendation: "Demote one to a secondary style.",
    screenshotUrl: "/api/artifacts/runs/run_1/hero.png",
    screenshotKey: "runs/run_1/hero.png",
    elementSelector: "#hero .cta",
    pageUrl: "https://example.com/",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("narrows non-canonical stored strings onto the unions", () => {
    const typed = toTypedFeedback(row);

    expect(typed.category).toBe("Cognitive Load");
    expect(typed.severity).toBe("High");
  });

  it("leaves every other column untouched", () => {
    const typed = toTypedFeedback(row);

    expect(typed.id).toBe(row.id);
    expect(typed.title).toBe(row.title);
    expect(typed.elementSelector).toBe(row.elementSelector);
    expect(typed.createdAt).toBe(row.createdAt);
  });
});
