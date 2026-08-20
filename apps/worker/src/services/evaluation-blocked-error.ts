/**
 * Thrown when a live Stagehand audit hits an unpassable anti-bot wall
 * (CAPTCHA, Datadome, hard timeout, etc.). The worker persists
 * `FAILED_AT_BLOCKER` and resolves the BullMQ job successfully so permanent
 * IP blocks are not retried endlessly.
 */
export class EvaluationBlockedError extends Error {
  override readonly name = "EvaluationBlockedError";

  constructor(
    message: string,
    readonly screenshotKey: string | null = null,
    readonly screenshotUrl: string | null = null,
    readonly rawResponse: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function isEvaluationBlockedError(
  error: unknown,
): error is EvaluationBlockedError {
  return error instanceof EvaluationBlockedError;
}

/** User-facing summary stored on `EvaluationRun.summary` for blocker failures. */
export const BLOCKER_SUMMARY =
  "The evaluation was blocked by a CAPTCHA or anti-bot protection. See screenshot.";
