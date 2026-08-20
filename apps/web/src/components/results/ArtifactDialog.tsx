"use client";

import { useEffect } from "react";

import { artifactUrl } from "./severity";

/**
 * Modal preview for a stored screenshot. Images are streamed through the
 * `/api/artifacts` proxy, so the MinIO bucket stays private.
 */
export function ArtifactDialog({
  artifactKey,
  title,
  onClose,
}: {
  artifactKey: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--ink)]/60 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="animate-fade-up w-full max-w-5xl rounded-lg border border-[color:var(--line)] bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] px-4 py-3">
          <h2 className="truncate text-sm font-medium text-[color:var(--ink)]">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-3">
            <a
              href={artifactUrl(artifactKey)}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[color:var(--accent)] hover:underline"
            >
              Open original
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-[color:var(--muted)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--ink)]"
              autoFocus
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-auto bg-[color:var(--bg-0)] p-3">
          {/* Screenshots have arbitrary intrinsic dimensions and are proxied
              per-request, so next/image optimisation buys nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artifactUrl(artifactKey)}
            alt={title}
            className="mx-auto block w-full rounded border border-[color:var(--line)] bg-white"
          />
        </div>
      </div>
    </div>
  );
}
