import { describe, expect, it } from "vitest";
import { canTransitionEvaluation, createVerifierSnapshot, duplicateResponseCount, evaluationMetrics, evaluationResultFromVerification, normalizeDuplicateResponse, removeDuplicateResponses, rerunStatuses } from "./evaluation";

describe("evaluation domain", () => {
  it("creates an immutable verifier snapshot", () => {
    const task = { title: "Numeric", prompt: "Return 42", verifierType: "NUMERIC" as const, verifierConfig: { expected: 42, tolerance: 0 }, updatedAt: new Date("2026-01-01") };
    const snapshot = createVerifierSnapshot(task);
    (task.verifierConfig as { expected: number }).expected = 7;
    expect(snapshot).toMatchObject({ taskTitle: "Numeric", verifierConfig: { expected: 42 }, taskUpdatedAt: new Date("2026-01-01") });
  });

  it("enforces batch status transitions including cancellation and retry", () => {
    expect(canTransitionEvaluation("DRAFT", "QUEUED")).toBe(true);
    expect(canTransitionEvaluation("RUNNING", "CANCELLED")).toBe(true);
    expect(canTransitionEvaluation("FAILED", "QUEUED")).toBe(true);
    expect(canTransitionEvaluation("COMPLETED", "RUNNING")).toBe(false);
  });

  it("normalizes only duplicate keys and preserves stored responses", () => {
    const candidates = [{ response: " answer\r\n" }, { response: "answer" }, { response: "ANSWER" }];
    expect(normalizeDuplicateResponse(candidates[0].response)).toBe("answer");
    expect(duplicateResponseCount(candidates)).toBe(1);
    expect(removeDuplicateResponses(candidates)).toEqual([candidates[0], candidates[2]]);
    expect(candidates[0].response).toBe(" answer\r\n");
  });

  it("calculates counters, pass rate, reward, and timing distribution", () => {
    const metrics = evaluationMetrics([
      { status: "PASSED", reward: 1, executionTimeMs: 1 },
      { status: "FAILED", reward: 0, executionTimeMs: 3 },
      { status: "ERROR", reward: null, executionTimeMs: null },
    ], 1);
    expect(metrics).toEqual({ total: 4, processed: 4, passed: 1, failed: 1, invalid: 1, errors: 1, passRate: 0.5, averageReward: 0.5, averageVerificationTime: 2, medianVerificationTime: 2, minimumVerificationTime: 1, maximumVerificationTime: 3 });
  });

  it("handles empty batches without NaN", () => {
    expect(evaluationMetrics([])).toMatchObject({ total: 0, processed: 0, passRate: 0, averageReward: 0, medianVerificationTime: 0 });
  });

  it("maps verifier results and rerun modes without changing reward semantics", () => {
    expect(evaluationResultFromVerification({ passed: true, reward: 1, details: "ok", executionTimeMs: 1 })).toMatchObject({ status: "PASSED", reward: 1 });
    expect(rerunStatuses("FAILED")).toEqual(["FAILED"]);
    expect(rerunStatuses("ERROR")).toEqual(["ERROR"]);
    expect(rerunStatuses("ALL")).toEqual(["PASSED", "FAILED", "INVALID", "ERROR"]);
  });
});
