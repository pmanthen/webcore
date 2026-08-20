import { OnboardProjectForm } from "@/components/OnboardProjectForm";

export default function OnboardProjectPage() {
  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[color:var(--ink)]">
          Onboard project
        </h1>
        <p className="mt-1 max-w-xl text-[color:var(--muted)]">
          Provide a public URL. We save a pending evaluation and enqueue the AI
          agent worker via BullMQ.
        </p>
      </header>
      <OnboardProjectForm />
    </div>
  );
}
