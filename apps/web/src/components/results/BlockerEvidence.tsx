"use client";

import { useState } from "react";

import { ArtifactDialog } from "./ArtifactDialog";
import { artifactUrl } from "./severity";

/**
 * Full-bleed blocker evidence for runs that hit CAPTCHA / anti-bot walls.
 * Replaces the findings triage grid when status is FAILED_AT_BLOCKER.
 */
export function BlockerEvidence({
  artifactKey,
  label,
  summary,
}: {
  artifactKey: string | null;
  label: string;
  summary: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className="animate-fade-up space-y-4 rounded-lg border border-rose-200 bg-rose-50/60 p-5"
      style={{ animationDelay: "90ms" }}
      aria-label="Evaluation blocked"
    >
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-rose-950">
          Evaluation blocked
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-rose-900/90">
          {summary ??
            "The evaluation was blocked by a CAPTCHA or anti-bot protection. See screenshot."}
        </p>
      </div>

      {artifactKey ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group block w-full overflow-hidden rounded-md border border-rose-200 bg-white text-left shadow-sm transition hover:border-rose-400"
            aria-label={`Open blocker screenshot of ${label}`}
          >
            <span className="block max-h-[min(70vh,720px)] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={artifactUrl(artifactKey)}
                alt={`Blocker screenshot for ${label}`}
                className="w-full object-contain object-top"
              />
            </span>
            <span className="block border-t border-rose-100 px-3 py-2 text-xs font-medium text-rose-800">
              View blocker screenshot
            </span>
          </button>

          {open ? (
            <ArtifactDialog
              artifactKey={artifactKey}
              title={`Blocker screenshot — ${label}`}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : (
        <p className="rounded-md border border-dashed border-rose-200 bg-white/70 px-4 py-8 text-center text-sm text-rose-800/80">
          No blocker screenshot was captured (the browser session closed before
          evidence could be saved).
        </p>
      )}
    </section>
  );
}
