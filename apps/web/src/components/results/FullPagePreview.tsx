"use client";

import { useState } from "react";

import { ArtifactDialog } from "./ArtifactDialog";
import { artifactUrl } from "./severity";

/** Thumbnail of the run's full-page screenshot that opens the preview modal. */
export function FullPagePreview({
  artifactKey,
  label,
}: {
  artifactKey: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full max-w-[168px] overflow-hidden rounded-md border border-[color:var(--line)] bg-white text-left shadow-sm transition hover:border-[color:var(--accent)]"
        aria-label={`Open full-page screenshot of ${label}`}
      >
        <span className="block h-24 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artifactUrl(artifactKey)}
            alt={`Full-page screenshot of ${label}`}
            className="w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
          />
        </span>
        <span className="block px-2 py-1.5 text-xs font-medium text-[color:var(--accent)]">
          View full page
        </span>
      </button>

      {open ? (
        <ArtifactDialog
          artifactKey={artifactKey}
          title={`Full-page screenshot — ${label}`}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
