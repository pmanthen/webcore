import {
  ISSUE_CATEGORIES,
  normalizeCategory,
  normalizeSeverity,
} from "@autonomous-ux/database";
import { describe, expect, it } from "vitest";

import {
  HEURISTIC_PILLARS,
  OVERLAY_IGNORE_INSTRUCTION,
  pageOverviewSchema,
  pillarExtractionSchema,
} from "../src/services/heuristics/schemas.js";

const validFinding = {
  title: "Hero image has no alt text",
  description:
    "The lead image carries the value proposition but exposes no accessible name.",
  recommendation: "Add a descriptive alt attribute.",
  severity: "High",
  cssSelector: "header img.hero",
  elementDescription: "Large hero image at the top of the page",
  evidence: '<img class="hero" src="/hero.png">',
};

describe("pillarExtractionSchema", () => {
  it("accepts a well-formed pillar response", () => {
    const parsed = pillarExtractionSchema.parse({ findings: [validFinding] });

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.severity).toBe("High");
    expect(parsed.findings[0]?.cssSelector).toBe("header img.hero");
  });

  it("accepts a pillar that found nothing", () => {
    expect(pillarExtractionSchema.parse({ findings: [] }).findings).toEqual([]);
  });

  it("accepts explicit nulls for the optional locator fields", () => {
    const parsed = pillarExtractionSchema.parse({
      findings: [
        {
          ...validFinding,
          cssSelector: null,
          elementDescription: null,
          evidence: null,
        },
      ],
    });

    expect(parsed.findings[0]?.cssSelector).toBeNull();
    expect(parsed.findings[0]?.elementDescription).toBeNull();
    expect(parsed.findings[0]?.evidence).toBeNull();
  });

  it("rejects an omitted locator field, because strict mode requires the key", () => {
    // Modelled as .nullable() rather than .optional() on purpose: OpenAI strict
    // structured output treats a missing property as a hard error.
    const { cssSelector: _omitted, ...withoutSelector } = validFinding;

    expect(
      pillarExtractionSchema.safeParse({ findings: [withoutSelector] }).success,
    ).toBe(false);
  });

  it("rejects a missing findings array", () => {
    expect(pillarExtractionSchema.safeParse({}).success).toBe(false);
  });

  it("reports failure rather than throwing on wholly malformed output", () => {
    for (const payload of [
      null,
      undefined,
      "findings",
      42,
      [],
      { findings: {} },
    ]) {
      expect(() => pillarExtractionSchema.safeParse(payload)).not.toThrow();
      expect(pillarExtractionSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("rejects a severity outside the enum so the caller can fall back", () => {
    // The schema is the strict gate; normalizeSeverity is the safety net behind
    // it. Both halves of that contract matter, so assert them together.
    for (const severity of ["Critical", "blocker", "sev-1", "high", ""]) {
      expect(
        pillarExtractionSchema.safeParse({
          findings: [{ ...validFinding, severity }],
        }).success,
      ).toBe(false);

      expect(() => normalizeSeverity(severity)).not.toThrow();
      expect(["Low", "Medium", "High"]).toContain(normalizeSeverity(severity));
    }
  });

  it("surfaces the offending path on failure instead of throwing", () => {
    const result = pillarExtractionSchema.safeParse({
      findings: [{ ...validFinding, title: 42 }],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues[0]?.path).toEqual(["findings", 0, "title"]);
  });
});

describe("pageOverviewSchema", () => {
  it("accepts a complete overview", () => {
    const parsed = pageOverviewSchema.parse({
      pageType: "marketing landing page",
      primaryGoal: "Start a free trial",
      overallImpression: "The page is tidy but buries its call to action.",
    });

    expect(parsed.pageType).toBe("marketing landing page");
  });

  it("rejects a partial overview rather than filling in blanks", () => {
    expect(
      pageOverviewSchema.safeParse({ pageType: "marketing landing page" })
        .success,
    ).toBe(false);
  });
});

describe("HEURISTIC_PILLARS", () => {
  it("covers each canonical category exactly once", () => {
    const categories = HEURISTIC_PILLARS.map((pillar) => pillar.category);

    expect(categories).toHaveLength(ISSUE_CATEGORIES.length);
    expect(new Set(categories).size).toBe(ISSUE_CATEGORIES.length);
    for (const category of ISSUE_CATEGORIES) {
      expect(categories).toContain(category);
    }
  });

  it("declares categories that survive normalization unchanged", () => {
    for (const pillar of HEURISTIC_PILLARS) {
      expect(normalizeCategory(pillar.category)).toBe(pillar.category);
    }
  });

  it("gives every pillar a non-empty instruction", () => {
    for (const pillar of HEURISTIC_PILLARS) {
      expect(pillar.instruction.trim().length).toBeGreaterThan(0);
    }
  });

  it("injects the overlay-ignore CRITICAL instruction into every pillar", () => {
    for (const pillar of HEURISTIC_PILLARS) {
      expect(pillar.instruction).toContain(OVERLAY_IGNORE_INSTRUCTION);
      expect(pillar.instruction).toContain(
        "focus ONLY on the core product/content interface",
      );
    }
  });

  it("describes findings as primary-DOM only in the extraction schema", () => {
    const description = pillarExtractionSchema.shape.findings.description;
    expect(description).toMatch(/primary product\/content DOM/i);
    expect(description).toMatch(/cookie consent/i);
  });
});
