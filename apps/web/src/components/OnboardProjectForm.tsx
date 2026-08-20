"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type SubmitState =
  | { kind: "idle" }
  | { kind: "success"; projectId: string }
  | { kind: "error"; message: string };

export function OnboardProjectForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "idle" });

    startTransition(async () => {
      try {
        const response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            ...(name.trim() ? { name: name.trim() } : {}),
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          projectId?: string;
        };

        if (!response.ok || !payload.projectId) {
          setState({
            kind: "error",
            message: payload.error ?? "Failed to queue evaluation",
          });
          return;
        }

        setState({ kind: "success", projectId: payload.projectId });
        setUrl("");
        setName("");
        router.push("/dashboard");
        router.refresh();
      } catch {
        setState({
          kind: "error",
          message: "Network error while queuing evaluation",
        });
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-up mx-auto flex w-full max-w-xl flex-col gap-5"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[color:var(--ink)]">
          Project URL
        </span>
        <input
          type="url"
          name="url"
          required
          placeholder="https://example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="rounded-md border border-[color:var(--line)] bg-white/80 px-3 py-2 text-[color:var(--ink)] outline-none ring-[color:var(--accent)] transition focus:ring-2"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[color:var(--ink)]">
          Display name <span className="text-[color:var(--muted)]">(optional)</span>
        </span>
        <input
          type="text"
          name="name"
          placeholder="Marketing site"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-[color:var(--line)] bg-white/80 px-3 py-2 text-[color:var(--ink)] outline-none ring-[color:var(--accent)] transition focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={isPending || url.trim().length === 0}
        className="rounded-md bg-[color:var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Queuing evaluation…" : "Start UX evaluation"}
      </button>

      {state.kind === "error" ? (
        <p className="text-sm text-rose-700" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "success" ? (
        <p className="text-sm text-emerald-700">
          Queued project {state.projectId}. Redirecting to dashboard…
        </p>
      ) : null}
    </form>
  );
}
