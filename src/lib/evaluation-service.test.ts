import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const batchUpdateMany = vi.fn();
  const batchUpdate = vi.fn();
  const batchFindUnique = vi.fn();
  const resultFindMany = vi.fn();
  const resultUpdateMany = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();
  const prisma = { evaluationBatch: { updateMany: batchUpdateMany, update: batchUpdate, findUnique: batchFindUnique }, evaluationResult: { findMany: resultFindMany, updateMany: resultUpdateMany }, auditEvent: { create: auditCreate }, $transaction: transaction };
  return { batchUpdateMany, batchUpdate, batchFindUnique, resultFindMany, resultUpdateMany, auditCreate, transaction, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { evaluateCandidateSafely, runEvaluationBatch } from "./evaluation-service";

describe("evaluation execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchUpdateMany.mockResolvedValue({ count: 1 });
    mocks.batchUpdate.mockResolvedValue({});
    mocks.resultUpdateMany.mockImplementation(async (input) => ({ count: input.where.id?.in?.length ?? 1 }));
    mocks.auditCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("evaluates EXACT_MATCH, NUMERIC, and REGEX using existing semantics", () => {
    expect(evaluateCandidateSafely(" YES ", { type: "EXACT_MATCH", config: { expected: "yes" } }).data).toMatchObject({ status: "PASSED", reward: 1 });
    expect(evaluateCandidateSafely("42.1", { type: "NUMERIC", config: { expected: 42, tolerance: 0 } }).data).toMatchObject({ status: "FAILED", reward: 0 });
    expect(evaluateCandidateSafely("ABC-42", { type: "REGEX", config: { pattern: "^[A-Z]+-\\d+$" } }).data).toMatchObject({ status: "PASSED", reward: 1 });
  });

  it("stores one verifier exception as ERROR without assigning reward", () => {
    const result = evaluateCandidateSafely("candidate", { type: "EXACT_MATCH", config: { expected: "candidate" } }, () => { throw new Error("boom"); });
    expect(result.data).toMatchObject({ status: "ERROR", reward: null, errorMessage: "Verifier execution failed." });
  });

  it("persists mixed chunk progress and completes the batch", async () => {
    mocks.batchFindUnique
      .mockResolvedValueOnce({ id: "batch-1", taskId: "task-1", task: { projectId: "project-1" }, verifierTypeSnapshot: "NUMERIC", verifierConfigSnapshot: { expected: 42, tolerance: 0 }, requestedCount: 2, importInvalidCount: 0 })
      .mockResolvedValueOnce({ status: "RUNNING" })
      .mockResolvedValueOnce({ status: "RUNNING" });
    mocks.resultFindMany
      .mockResolvedValueOnce([{ id: "r1", candidateResponse: "42" }, { id: "r2", candidateResponse: "41" }])
      .mockResolvedValueOnce([{ status: "PASSED", reward: 1, executionTimeMs: 1 }, { status: "FAILED", reward: 0, executionTimeMs: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "PASSED", reward: 1, executionTimeMs: 1 }, { status: "FAILED", reward: 0, executionTimeMs: 2 }]);

    expect(await runEvaluationBatch("batch-1")).toEqual({ ok: true, status: "COMPLETED" });
    expect(mocks.batchUpdate).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: expect.objectContaining({ processedCount: 2, passedCount: 1, failedCount: 1, progress: 100 }) });
    expect(mocks.resultUpdateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "RUNNING" }, data: expect.objectContaining({ status: "PASSED", reward: 1 }) });
    expect(mocks.resultUpdateMany).toHaveBeenCalledWith({ where: { id: "r2", status: "RUNNING" }, data: expect.objectContaining({ status: "FAILED", reward: 0 }) });
  });

  it("stops between chunks when cancelled", async () => {
    mocks.batchFindUnique
      .mockResolvedValueOnce({ id: "batch-1", taskId: "task-1", task: { projectId: "project-1" }, verifierTypeSnapshot: "EXACT_MATCH", verifierConfigSnapshot: { expected: "yes", caseSensitive: false, trimWhitespace: true }, requestedCount: 1, importInvalidCount: 0 })
      .mockResolvedValueOnce({ status: "CANCELLED" });
    mocks.resultFindMany.mockResolvedValue([]);
    expect(await runEvaluationBatch("batch-1")).toEqual({ ok: true, status: "CANCELLED" });
  });

  it("rejects a duplicate execution claim idempotently", async () => {
    mocks.batchUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await runEvaluationBatch("batch-1")).toEqual({ ok: false, error: "Batch is not queued or is already running." });
    expect(mocks.resultFindMany).not.toHaveBeenCalled();
  });
});
