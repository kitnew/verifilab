import { describe, expect, it } from "vitest";
import { evaluationContentDisposition, evaluationExportFilename, serializeEvaluation, type EvaluationExportBatch } from "./evaluation-export";

const batch: EvaluationExportBatch = {
  id: "batch-1",
  name: "Unicode / Rollouts",
  taskId: "task-1",
  taskPromptSnapshot: "Return привет",
  verifierTypeSnapshot: "EXACT_MATCH",
  verifierConfigSnapshot: { expected: "привет" },
  createdAt: new Date("2026-07-20T12:00:00Z"),
  results: [
    { sequenceNumber: 2, candidateResponse: "fail", passed: false, reward: 0, status: "FAILED", modelName: null, modelVersion: null, temperature: null, seed: null, externalId: null, details: "No", normalizedCandidate: null, executionTimeMs: 2, metadata: null },
    { sequenceNumber: 1, candidateResponse: 'привет, "мир"\nline 2', passed: true, reward: 1, status: "PASSED", modelName: "demo", modelVersion: "v1", temperature: 0.7, seed: 42, externalId: "r-1", details: "Matched", normalizedCandidate: "привет", executionTimeMs: 1, metadata: { source: "manual" } },
  ],
};

describe("evaluation export", () => {
  it("serializes deterministic filtered-ready JSONL in sequence order", () => {
    const jsonl = serializeEvaluation(batch, "jsonl");
    expect(JSON.parse(jsonl.split("\n")[0])).toMatchObject({ sequenceNumber: 1, candidateResponse: 'привет, "мир"\nline 2', verifierConfig: { expected: "привет" } });
    expect(jsonl.endsWith("\n")).toBe(true);
  });

  it("emits valid CSV escaping commas, quotes, newlines, and Unicode", () => {
    const csv = serializeEvaluation(batch, "csv");
    expect(csv).toContain('"привет, ""мир""\nline 2"');
    expect(csv).toContain('"{""expected"":""привет""}"');
    expect(csv.startsWith("batchId,taskId,sequenceNumber")).toBe(true);
  });

  it("creates safe dated attachment filenames", () => {
    expect(evaluationExportFilename(batch.name, batch.createdAt, "jsonl")).toBe("verifilab-evaluation-unicode-rollouts-2026-07-20.jsonl");
    expect(evaluationContentDisposition(batch.name, batch.createdAt, "csv")).toBe('attachment; filename="verifilab-evaluation-unicode-rollouts-2026-07-20.csv"');
  });
});
