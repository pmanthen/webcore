import {
  normalizeSeverity,
  type IssueCategory,
  type UxFinding,
} from "@autonomous-ux/database";
import type { Action } from "@browserbasehq/stagehand";

import type { RawFinding } from "./schemas.js";

/** A raw finding plus the selector work needed before it can be persisted. */
export interface ResolvedFinding extends UxFinding {
  /** Selector the LLM proposed, kept for debugging when resolution disagreed. */
  proposedSelector: string | null;
  /** How `elementSelector` was arrived at. */
  selectorSource: "llm" | "observed" | "none";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

/**
 * Score how well a described element matches an element `observe()` found, by
 * token overlap. Deliberately crude: it only has to pick the best of a handful
 * of candidates, and a wrong guess costs a screenshot, not correctness.
 */
function similarity(description: string, candidate: string): number {
  const wanted = new Set(tokenize(description));
  if (wanted.size === 0) {
    return 0;
  }

  const candidateTokens = new Set(tokenize(candidate));
  let shared = 0;
  for (const token of wanted) {
    if (candidateTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / wanted.size;
}

/** Best observed element for a described one, or null when nothing is close. */
function matchObservedElement(
  description: string,
  observed: readonly Action[],
  threshold = 0.5,
): Action | null {
  let best: Action | null = null;
  let bestScore = 0;

  for (const action of observed) {
    const score = similarity(description, action.description);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }

  return bestScore >= threshold ? best : null;
}

function cleanText(value: string, maxLength: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…`
    : collapsed;
}

export interface ResolveOptions {
  category: IssueCategory;
  pageUrl: string;
  observed: readonly Action[];
  /** Checks a proposed selector against the live DOM. */
  selectorExists: (selector: string) => Promise<boolean>;
}

/**
 * Turn raw LLM findings into persistable ones: canonical severity, trimmed copy,
 * and an `elementSelector` that actually resolves in the DOM.
 *
 * A selector the model invented is only trusted once it has been verified
 * against the live page. Otherwise the model's element description is matched
 * against the `observe()` results, which are real selectors by construction.
 */
export async function resolveFindings(
  raw: readonly RawFinding[],
  options: ResolveOptions,
): Promise<ResolvedFinding[]> {
  const resolved: ResolvedFinding[] = [];

  for (const finding of raw) {
    if (!finding.title?.trim() || !finding.description?.trim()) {
      continue;
    }

    const proposed = finding.cssSelector?.trim() || null;
    let elementSelector: string | null = null;
    let selectorSource: ResolvedFinding["selectorSource"] = "none";

    if (proposed && (await options.selectorExists(proposed))) {
      elementSelector = proposed;
      selectorSource = "llm";
    } else if (finding.elementDescription?.trim()) {
      const match = matchObservedElement(
        finding.elementDescription,
        options.observed,
      );
      if (match) {
        elementSelector = match.selector;
        selectorSource = "observed";
      }
    }

    resolved.push({
      category: options.category,
      severity: normalizeSeverity(finding.severity),
      title: cleanText(finding.title, 160),
      description: cleanText(finding.description, 600),
      recommendation: finding.recommendation?.trim()
        ? cleanText(finding.recommendation, 600)
        : "No recommendation returned by the agent.",
      elementSelector,
      pageUrl: options.pageUrl,
      proposedSelector: proposed,
      selectorSource,
    });
  }

  return dedupe(resolved);
}

/**
 * Independent pillar prompts occasionally surface the same defect twice. Keep
 * the first occurrence per category + normalized title.
 */
function dedupe(findings: readonly ResolvedFinding[]): ResolvedFinding[] {
  const seen = new Set<string>();
  const unique: ResolvedFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.category}::${finding.title.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }

  return unique;
}
