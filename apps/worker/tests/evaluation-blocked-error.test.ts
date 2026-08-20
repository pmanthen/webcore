import { describe, expect, it } from "vitest";

import {
  BLOCKER_SUMMARY,
  EvaluationBlockedError,
  isEvaluationBlockedError,
} from "../src/services/evaluation-blocked-error.js";

describe("EvaluationBlockedError", () => {
  it("carries screenshot keys and raw response for persistence", () => {
    const error = new EvaluationBlockedError(
      BLOCKER_SUMMARY,
      "runs/run_1/blocker.png",
      "http://localhost:9000/ux-artifacts/runs/run_1/blocker.png",
      { blocked: true, cause: "timeout" },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EvaluationBlockedError");
    expect(error.message).toBe(BLOCKER_SUMMARY);
    expect(error.screenshotKey).toBe("runs/run_1/blocker.png");
    expect(error.rawResponse).toEqual({ blocked: true, cause: "timeout" });
    expect(isEvaluationBlockedError(error)).toBe(true);
  });

  it("rejects ordinary errors", () => {
    expect(isEvaluationBlockedError(new Error("boom"))).toBe(false);
    expect(isEvaluationBlockedError(null)).toBe(false);
  });
});
