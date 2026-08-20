import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from "@autonomous-ux/database";
import { describe, expect, it } from "vitest";

import {
  CATEGORY_TONE,
  SEVERITY_TONE,
  scoreTone,
} from "@/components/results/severity";

describe("tone maps", () => {
  it("styles every canonical severity", () => {
    for (const severity of ISSUE_SEVERITIES) {
      expect(SEVERITY_TONE[severity]).toBeTruthy();
    }
    expect(Object.keys(SEVERITY_TONE)).toHaveLength(ISSUE_SEVERITIES.length);
  });

  it("styles every canonical category", () => {
    for (const category of ISSUE_CATEGORIES) {
      expect(CATEGORY_TONE[category]).toBeTruthy();
    }
    expect(Object.keys(CATEGORY_TONE)).toHaveLength(ISSUE_CATEGORIES.length);
  });

  it("gives each severity a distinct tone so badges stay readable", () => {
    expect(new Set(Object.values(SEVERITY_TONE)).size).toBe(
      ISSUE_SEVERITIES.length,
    );
  });
});

describe("scoreTone", () => {
  it("reads green from 80 upwards", () => {
    expect(scoreTone(80)).toBe("#0f766e");
    expect(scoreTone(100)).toBe("#0f766e");
  });

  it("reads amber between 55 and 79", () => {
    expect(scoreTone(55)).toBe("#b45309");
    expect(scoreTone(79)).toBe("#b45309");
  });

  it("reads red below 55", () => {
    expect(scoreTone(54)).toBe("#be123c");
    expect(scoreTone(0)).toBe("#be123c");
  });

  it("returns a colour for every score the gauge can render", () => {
    for (let score = 0; score <= 100; score += 1) {
      expect(scoreTone(score)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
