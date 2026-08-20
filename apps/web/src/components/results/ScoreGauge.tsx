import { scoreTone } from "./severity";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Aggregate UX score as a radial gauge. Pure SVG so it renders on the server
 * with no client JavaScript.
 */
export function ScoreGauge({
  score,
  size = 128,
}: {
  score: number | null;
  size?: number;
}) {
  const hasScore = typeof score === "number";
  const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const dash = (clamped / 100) * CIRCUMFERENCE;
  const tone = hasScore ? scoreTone(clamped) : "var(--line)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        hasScore ? `UX score ${clamped} out of 100` : "UX score unavailable"
      }
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="var(--line)"
          strokeWidth="10"
        />
        {hasScore ? (
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke={tone}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-[family-name:var(--font-display)] text-3xl leading-none"
          style={{ color: tone }}
        >
          {hasScore ? clamped : "—"}
        </span>
        <span className="mt-1 text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
          / 100
        </span>
      </div>
    </div>
  );
}
