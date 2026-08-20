"use client";

import { useState } from "react";

import type { FindingView } from "@/lib/results";

import { CATEGORY_TONE, SEVERITY_TONE, artifactUrl } from "./severity";

export function FindingCard({
  finding,
  onPreview,
}: {
  finding: FindingView;
  onPreview: (key: string, title: string) => void;
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <article className="animate-fade-up flex flex-col overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] shadow-sm">
      {finding.screenshotKey ? (
        <button
          type="button"
          onClick={() =>
            onPreview(finding.screenshotKey as string, finding.title)
          }
          className="group flex h-40 items-center justify-center overflow-hidden border-b border-[color:var(--line)] bg-white p-2"
          aria-label={`Enlarge screenshot for: ${finding.title}`}
        >
          {/* Element crops vary wildly in aspect ratio, so contain the whole
              thing rather than cover-cropping a slice of the evidence. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artifactUrl(finding.screenshotKey)}
            alt={`Screenshot of the element behind: ${finding.title}`}
            className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </button>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_TONE[finding.severity]}`}
          >
            {finding.severity}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CATEGORY_TONE[finding.category]}`}
          >
            {finding.category}
          </span>
        </div>

        <h3 className="font-[family-name:var(--font-display)] text-lg leading-snug text-[color:var(--ink)]">
          {finding.title}
        </h3>

        <p className="text-sm leading-relaxed text-[color:var(--muted)]">
          {finding.description}
        </p>

        <div className="rounded-md bg-[color:var(--accent-soft)]/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--accent)]">
            Recommendation
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink)]">
            {finding.recommendation}
          </p>
        </div>

        {finding.elementSelector ? (
          <div className="mt-auto">
            <button
              type="button"
              onClick={() => setInspectorOpen((open) => !open)}
              aria-expanded={inspectorOpen}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--accent)] transition hover:underline"
            >
              <span
                aria-hidden="true"
                className={`inline-block transition-transform duration-200 ${
                  inspectorOpen ? "rotate-90" : ""
                }`}
              >
                ▸
              </span>
              {inspectorOpen ? "Hide element" : "Inspect element"}
            </button>

            {inspectorOpen ? (
              <pre className="mt-2 overflow-x-auto rounded-md bg-[color:var(--ink)] p-3 text-xs leading-relaxed text-[color:var(--bg-0)]">
                <code>{finding.elementSelector}</code>
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
