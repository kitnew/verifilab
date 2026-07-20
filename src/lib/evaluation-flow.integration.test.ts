import { expect, it } from "vitest";
import { createVerifierSnapshot, evaluationMetrics, evaluationResultFromVerification } from "./evaluation";
import { serializeEvaluation } from "./evaluation-export";
import { parseJsonlImport } from "./evaluation-import";
import { verify } from "./verifier";

it("runs the primary task-to-import-to-reward-to-filtered-export flow", () => {
  const task = { title: "Multiply", prompt: "Solve 18 × 7", verifierType: "NUMERIC" as const, verifierConfig: { expected: 126, tolerance: 0 }, updatedAt: new Date("2026-07-20") };
  const snapshot = createVerifierSnapshot(task);
  const imported = parseJsonlImport('{"response":"126","modelName":"demo"}\n{"response":"124","modelName":"demo"}\n{"response":"bad","externalId":"r-3"}\n');
  task.verifierConfig.expected = 999;
  const results = imported.valid.map((candidate, index) => ({ sequenceNumber: index + 1, candidateResponse: candidate.response, modelName: candidate.modelName ?? null, modelVersion: null, temperature: null, seed: null, externalId: candidate.externalId ?? null, metadata: candidate.metadata ?? null, ...evaluationResultFromVerification(verify(candidate.response, { type: snapshot.verifierType, config: snapshot.verifierConfig } as Parameters<typeof verify>[1])) }));
  expect(evaluationMetrics(results).passed).toBe(1);
  expect(evaluationMetrics(results).failed).toBe(2);
  const failed = results.filter((result) => result.status === "FAILED");
  const jsonl = serializeEvaluation({ id: "batch-1", name: "Happy path", taskId: "task-1", taskPromptSnapshot: snapshot.taskPrompt, verifierTypeSnapshot: snapshot.verifierType, verifierConfigSnapshot: snapshot.verifierConfig, createdAt: new Date("2026-07-20"), results: failed.map((result) => ({ ...result, normalizedCandidate: result.normalizedCandidate ?? null })) }, "jsonl");
  expect(jsonl.trim().split("\n")).toHaveLength(2);
  expect(jsonl).toContain('"candidateResponse":"124"');
});
