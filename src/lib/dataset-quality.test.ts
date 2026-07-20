import { describe, expect, it } from "vitest";
import { analyzeDatasetQuality, normalizeQualityPrompt, type QualityTask } from "./dataset-quality";

function task(id: string, overrides: Partial<QualityTask> = {}): QualityTask {
  return {
    id,
    title: `Task ${id}`,
    prompt: `Return the exact answer for ${id}.`,
    status: "APPROVED",
    verifierType: "EXACT_MATCH",
    verifierConfig: { expected: "yes", caseSensitive: false, trimWhitespace: true },
    difficulty: "EASY",
    tags: ["quality"],
    generatorTemplate: null,
    verificationRuns: [{ passed: true }],
    evaluationBatches: [],
    ...overrides,
  };
}

describe("dataset quality analysis", () => {
  it("normalizes line endings, whitespace, and case for duplicate prompts", () => {
    expect(normalizeQualityPrompt("  Solve\r\n  THIS   task ")).toBe("solve this task");
    const report = analyzeDatasetQuality([
      task("one", { prompt: "Solve\r\n this task" }),
      task("two", { prompt: " solve THIS   task " }),
    ]);
    expect(report.issues).toContainEqual(expect.objectContaining({ severity: "WARNING", category: "DUPLICATE", taskIds: ["one", "two"] }));
    expect(report.duplicateSafetyScore).toBe(0);
  });

  it("calculates the documented weighted score from affected task ratios", () => {
    const report = analyzeDatasetQuality([
      task("healthy"),
      task("weak", { title: " ", tags: [], verifierConfig: {}, verificationRuns: [] }),
    ]);
    expect(report).toMatchObject({ completenessScore: 13, verifierValidityScore: 15, duplicateSafetyScore: 20, verificationEvidenceScore: 13, overallScore: 61 });
  });

  it("assigns actionable severities to content, metadata, and evidence issues", () => {
    const report = analyzeDatasetQuality([task("weak", { prompt: "", difficulty: null, tags: [], verificationRuns: [] })]);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "ERROR", category: "CONTENT" }),
      expect.objectContaining({ severity: "WARNING", category: "METADATA" }),
      expect.objectContaining({ severity: "INFO", category: "METADATA" }),
      expect.objectContaining({ severity: "WARNING", category: "EVIDENCE" }),
    ]));
  });

  it("uses shared verifier validation for incomplete configurations", () => {
    const report = analyzeDatasetQuality([
      task("invalid-regex", { verifierType: "REGEX", verifierConfig: { pattern: "[", flags: "" } }),
      task("incomplete-exact", { verifierConfig: { expected: "", caseSensitive: false, trimWhitespace: true } }),
    ]);
    expect(report.verifierValidityScore).toBe(0);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "ERROR", category: "VERIFIER", taskIds: ["invalid-regex"] }),
      expect.objectContaining({ severity: "ERROR", category: "VERIFIER", taskIds: ["incomplete-exact"] }),
    ]));
  });

  it("detects always-pass and always-fail completed rollout evaluations", () => {
    const completed = (status: "PASSED" | "FAILED", reward: 0 | 1) => [{ results: [{ status, reward, executionTimeMs: 1 }] }];
    const report = analyzeDatasetQuality([
      task("passing", { evaluationBatches: completed("PASSED", 1) }),
      task("failing", { evaluationBatches: completed("FAILED", 0) }),
    ]);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "INFO", explanation: "All recorded rollout evaluations pass.", taskIds: ["passing"] }),
      expect.objectContaining({ severity: "WARNING", explanation: "All recorded rollout evaluations fail.", taskIds: ["failing"] }),
    ]));
    expect(report.verificationEvidenceScore).toBe(0);
  });

  it("returns zero scores and empty distributions for an empty dataset", () => {
    expect(analyzeDatasetQuality([])).toEqual(expect.objectContaining({ taskCount: 0, overallScore: 0, completenessScore: 0, verifierValidityScore: 0, duplicateSafetyScore: 0, verificationEvidenceScore: 0, issues: [], distributions: { difficulty: {}, verifierType: {}, source: {}, verificationPassRate: {} } }));
  });
});
