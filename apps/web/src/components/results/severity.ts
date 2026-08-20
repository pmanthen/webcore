import type { IssueCategory, IssueSeverity } from "@autonomous-ux/database";

/** Badge styling per severity. Red reads as "stop", amber as "look", slate as "note". */
export const SEVERITY_TONE: Record<IssueSeverity, string> = {
  High: "bg-rose-100 text-rose-900 ring-rose-300",
  Medium: "bg-amber-100 text-amber-900 ring-amber-300",
  Low: "bg-slate-100 text-slate-700 ring-slate-300",
};

export const CATEGORY_TONE: Record<IssueCategory, string> = {
  Accessibility: "bg-sky-50 text-sky-900 ring-sky-200",
  "Cognitive Load": "bg-violet-50 text-violet-900 ring-violet-200",
  Friction: "bg-orange-50 text-orange-900 ring-orange-200",
};

/** Colour for the score gauge: green passing, amber borderline, red failing. */
export function scoreTone(score: number): string {
  if (score >= 80) {
    return "#0f766e";
  }
  if (score >= 55) {
    return "#b45309";
  }
  return "#be123c";
}

export function artifactUrl(key: string): string {
  return `/api/artifacts/${key.split("/").map(encodeURIComponent).join("/")}`;
}
