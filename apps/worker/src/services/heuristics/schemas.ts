import type { IssueCategory } from "@autonomous-ux/database";
import { z } from "zod";

/**
 * Injected into every pillar `extract()` instruction so ephemeral chrome is
 * never scored as product UX friction.
 */
export const OVERLAY_IGNORE_INSTRUCTION =
  "CRITICAL: Do NOT evaluate cookie consent banners, privacy policy disclaimers, or standard customer support chat widgets as UX friction. Ignore them entirely. Your evaluation must focus ONLY on the core product/content interface.";

/**
 * Every optional field is modelled as `.nullable()` rather than `.optional()`.
 * Stagehand converts these Zod schemas to JSON Schema for structured output, and
 * OpenAI's strict mode requires every property to be listed as required — a
 * missing key is a hard error, whereas an explicit `null` is not.
 */
const rawFindingSchema = z.object({
  title: z
    .string()
    .describe(
      "Short imperative headline for a problem in the primary product/content DOM (not cookie banners, privacy disclaimers, or chat widgets), under 80 characters",
    ),
  description: z
    .string()
    .describe(
      "What is wrong in the core product/content interface and why it hurts the user, in one or two plain sentences. Must not describe ephemeral overlays.",
    ),
  recommendation: z
    .string()
    .describe("Concrete, specific fix a developer or designer can act on"),
  severity: z
    .enum(["Low", "Medium", "High"])
    .describe(
      "High = blocks or excludes users; Medium = clearly slows or confuses them; Low = polish",
    ),
  cssSelector: z
    .string()
    .nullable()
    .describe(
      "CSS selector for an offending element in the primary page structure (never an ephemeral overlay/widget), or null if it is not tied to one element",
    ),
  elementDescription: z
    .string()
    .nullable()
    .describe(
      "Human description of the primary-DOM element, used to match it against observed elements",
    ),
  evidence: z
    .string()
    .nullable()
    .describe("Quoted text or attribute values that justify the finding"),
});

export type RawFinding = z.infer<typeof rawFindingSchema>;

export const pillarExtractionSchema = z.object({
  findings: z
    .array(rawFindingSchema)
    .describe(
      "Problems in the primary product/content DOM only. Do NOT include cookie consent banners, privacy policy disclaimers, or customer support chat widgets. [] if none.",
    ),
});

export type PillarExtraction = z.infer<typeof pillarExtractionSchema>;

/** Page-level context used to write the executive summary. */
export const pageOverviewSchema = z.object({
  pageType: z
    .string()
    .describe("What kind of page this is, e.g. 'marketing landing page'"),
  primaryGoal: z
    .string()
    .describe("The single action the page most wants the visitor to take"),
  overallImpression: z
    .string()
    .describe(
      "Two sentences on how well the page serves a first-time visitor, in an audit voice",
    ),
});

export type PageOverview = z.infer<typeof pageOverviewSchema>;

export interface HeuristicPillar {
  category: IssueCategory;
  /** Instruction passed to Stagehand's `extract()`. */
  instruction: string;
}

function pillarInstruction(body: string): string {
  return `${OVERLAY_IGNORE_INSTRUCTION}

${body}`;
}

/**
 * One `extract()` per pillar. Splitting them keeps each instruction narrow, which
 * produces sharper findings than a single omnibus prompt and lets one pillar fail
 * without losing the others.
 */
export const HEURISTIC_PILLARS: readonly HeuristicPillar[] = [
  {
    category: "Accessibility",
    instruction: pillarInstruction(`Audit this page for accessibility defects. Report only problems you can justify from the primary product/content interface.

Look for:
- Images or icon-only controls with no alt text and no accessible name.
- Form inputs with no associated visible label or aria-label.
- Text or controls whose colour contrast against their background looks below WCAG AA (4.5:1 for body text, 3:1 for large text).
- Non-interactive elements (div, span) wired up to act as buttons or links without a role, tabindex, or keyboard handler.
- Headings used out of order, or a page with no level-1 heading.

For each problem give the severity, the CSS selector when it belongs to one element in the primary DOM, and quote the evidence.`),
  },
  {
    category: "Cognitive Load",
    instruction: pillarInstruction(`Audit this page for cognitive load: work the visitor has to do to understand what is going on in the core product/content interface.

Look for:
- Navigation with so many items or nesting that scanning it is a chore.
- Two or more calls to action competing for the same primary emphasis, leaving no obvious next step.
- Vague or jargon-heavy copy where a concrete benefit belongs.
- Dense blocks of text with no headings, lists, or visual hierarchy to break them up.
- Repeated or near-duplicate links whose difference is unclear.

For each problem give the severity, the CSS selector when it belongs to one element in the primary DOM, and quote the evidence.`),
  },
  {
    category: "Friction",
    instruction: pillarInstruction(`Audit this page for friction: places where a motivated visitor stalls, backtracks, or fails in the core product/content interface.

Look for:
- Dead ends — controls that go nowhere, empty states with no way forward, or links to missing content.
- Form fields with no visible validation, no format hint, and no error messaging.
- Forms asking for more information than the task needs.
- Content or controls likely to shift position after load (late-loading banners, images without reserved space).
- Required steps whose cost is hidden until the visitor has already committed.

For each problem give the severity, the CSS selector when it belongs to one element in the primary DOM, and quote the evidence.`),
  },
];
