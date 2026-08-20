"use client";

import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  type IssueCategory,
  type IssueSeverity,
} from "@autonomous-ux/database";
import { useMemo, useState } from "react";

import type { FindingView } from "@/lib/results";

import { ArtifactDialog } from "./ArtifactDialog";
import { FindingCard } from "./FindingCard";
import { CATEGORY_TONE, SEVERITY_TONE } from "./severity";

type CategoryFilter = IssueCategory | "All";
type SeverityFilter = IssueSeverity | "All";

interface Preview {
  key: string;
  title: string;
}

function FilterButton({
  label,
  active,
  tone,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  tone?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
        active
          ? tone ?? "bg-[color:var(--accent)] text-white ring-[color:var(--accent)]"
          : "bg-white/70 text-[color:var(--muted)] ring-[color:var(--line)] hover:text-[color:var(--ink)]",
      ].join(" ")}
    >
      {label}
      {typeof count === "number" ? (
        <span className="ml-1.5 opacity-70">{count}</span>
      ) : null}
    </button>
  );
}

export function TriageBoard({ findings }: { findings: FindingView[] }) {
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [severity, setSeverity] = useState<SeverityFilter>("All");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    const bySeverity = new Map<string, number>();

    for (const finding of findings) {
      byCategory.set(
        finding.category,
        (byCategory.get(finding.category) ?? 0) + 1,
      );
      bySeverity.set(
        finding.severity,
        (bySeverity.get(finding.severity) ?? 0) + 1,
      );
    }

    return { byCategory, bySeverity };
  }, [findings]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return findings.filter((finding) => {
      if (category !== "All" && finding.category !== category) {
        return false;
      }
      if (severity !== "All" && finding.severity !== severity) {
        return false;
      }
      if (!needle) {
        return true;
      }

      return [
        finding.title,
        finding.description,
        finding.recommendation,
        finding.elementSelector ?? "",
      ].some((field) => field.toLowerCase().includes(needle));
    });
  }, [findings, category, severity, query]);

  const filtered = category !== "All" || severity !== "All" || query.trim();

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              Category
            </span>
            <FilterButton
              label="All"
              active={category === "All"}
              count={findings.length}
              onClick={() => setCategory("All")}
            />
            {ISSUE_CATEGORIES.map((value) => (
              <FilterButton
                key={value}
                label={value}
                active={category === value}
                tone={CATEGORY_TONE[value]}
                count={counts.byCategory.get(value) ?? 0}
                onClick={() => setCategory(value)}
              />
            ))}
          </div>

          <label className="relative sm:w-64">
            <span className="sr-only">Search findings</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search findings…"
              className="w-full rounded-md border border-[color:var(--line)] bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)] outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            Severity
          </span>
          <FilterButton
            label="All"
            active={severity === "All"}
            onClick={() => setSeverity("All")}
          />
          {ISSUE_SEVERITIES.map((value) => (
            <FilterButton
              key={value}
              label={value}
              active={severity === value}
              tone={SEVERITY_TONE[value]}
              count={counts.bySeverity.get(value) ?? 0}
              onClick={() => setSeverity(value)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[color:var(--ink)]">
          {filtered
            ? `${visible.length} of ${findings.length} findings`
            : `${findings.length} finding${findings.length === 1 ? "" : "s"}`}
        </h2>
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setCategory("All");
              setSeverity("All");
              setQuery("");
            }}
            className="text-sm text-[color:var(--accent)] transition hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[color:var(--line)] px-4 py-12 text-center text-[color:var(--muted)]">
          {findings.length === 0
            ? "This run produced no findings."
            : "No findings match the current filters."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              onPreview={(key, title) => setPreview({ key, title })}
            />
          ))}
        </div>
      )}

      {preview ? (
        <ArtifactDialog
          artifactKey={preview.key}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </section>
  );
}
