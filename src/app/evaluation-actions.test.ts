import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const taskFindUnique = vi.fn(); const batchFindUnique = vi.fn(); const batchCreate = vi.fn(); const batchUpdate = vi.fn(); const batchUpdateMany = vi.fn(); const batchDelete = vi.fn(); const resultCount = vi.fn(); const resultFindMany = vi.fn(); const resultUpdateMany = vi.fn(); const auditCreate = vi.fn(); const transaction = vi.fn(); const revalidatePath = vi.fn(); const getDemoRole = vi.fn();
  const tx = { evaluationBatch: { create: batchCreate, update: batchUpdate }, evaluationResult: { findMany: resultFindMany, updateMany: resultUpdateMany }, auditEvent: { create: auditCreate } };
  return { taskFindUnique, batchFindUnique, batchCreate, batchUpdate, batchUpdateMany, batchDelete, resultCount, resultFindMany, resultUpdateMany, auditCreate, transaction, revalidatePath, getDemoRole, tx };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/demo-role", () => ({ getDemoRole: mocks.getDemoRole }));
vi.mock("@/lib/prisma", () => ({ prisma: { task: { findUnique: mocks.taskFindUnique }, evaluationBatch: { findUnique: mocks.batchFindUnique, updateMany: mocks.batchUpdateMany, delete: mocks.batchDelete }, evaluationResult: { count: mocks.resultCount }, auditEvent: { create: mocks.auditCreate }, $transaction: mocks.transaction } }));

import { cancelEvaluationBatch, createEvaluationBatch, deleteEvaluationBatch, rerunEvaluationResults, retryEvaluationBatch } from "./evaluation-actions";

describe("evaluation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getDemoRole.mockResolvedValue("AUTHOR"); mocks.transaction.mockImplementation(async (input) => typeof input === "function" ? input(mocks.tx) : Promise.all(input)); mocks.batchUpdateMany.mockResolvedValue({ count: 1 }); mocks.batchUpdate.mockResolvedValue({}); mocks.resultUpdateMany.mockResolvedValue({ count: 1 }); mocks.resultFindMany.mockResolvedValue([]); mocks.auditCreate.mockResolvedValue({});
  });

  it("creates results with an immutable verifier snapshot and duplicate count", async () => {
    mocks.taskFindUnique.mockResolvedValue({ id: "task-1", projectId: "project-1", title: "Answer", prompt: "Return only yes.", verifierType: "EXACT_MATCH", verifierConfig: { expected: "yes", caseSensitive: false, trimWhitespace: true }, updatedAt: new Date("2026-01-01") });
    mocks.batchCreate.mockResolvedValue({ id: "batch-1" });
    const result = await createEvaluationBatch({ taskId: "task-1", name: "Run", description: "", sourceType: "MANUAL", candidates: [{ response: " yes " }, { response: "yes" }], invalidCount: 0, removeDuplicates: false });
    expect(result).toEqual({ batchId: "batch-1" });
    expect(mocks.batchCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ taskTitleSnapshot: "Answer", verifierConfigSnapshot: { expected: "yes", caseSensitive: false, trimWhitespace: true }, requestedCount: 2, duplicateCount: 1, results: { create: [expect.objectContaining({ sequenceNumber: 1, candidateResponse: " yes " }), expect.objectContaining({ sequenceNumber: 2, candidateResponse: "yes" })] } }) });
  });

  it("cancels a running batch with an atomic status guard", async () => {
    mocks.batchFindUnique.mockResolvedValue({ id: "batch-1", status: "RUNNING", taskId: "task-1", task: { projectId: "project-1" } });
    expect(await cancelEvaluationBatch("batch-1")).toEqual({});
    expect(mocks.batchUpdateMany).toHaveBeenCalledWith({ where: { id: "batch-1", status: "RUNNING" }, data: expect.objectContaining({ status: "CANCELLED" }) });
  });

  it("retries only interrupted work and preserves completed results", async () => {
    mocks.batchFindUnique.mockResolvedValue({ id: "batch-1", status: "FAILED", taskId: "task-1", importInvalidCount: 0, requestedCount: 2, task: { projectId: "project-1" } });
    expect(await retryEvaluationBatch("batch-1")).toEqual({});
    expect(mocks.resultUpdateMany).toHaveBeenCalledWith({ where: { evaluationBatchId: "batch-1", status: "RUNNING" }, data: { status: "PENDING" } });
    expect(mocks.batchUpdate).toHaveBeenLastCalledWith({ where: { id: "batch-1" }, data: { status: "QUEUED", errorMessage: null, completedAt: null } });
  });

  it("resets only selected results for an explicit rerun", async () => {
    mocks.batchFindUnique.mockResolvedValue({ id: "batch-1", status: "COMPLETED", taskId: "task-1", importInvalidCount: 0, requestedCount: 2, task: { projectId: "project-1" } }); mocks.resultCount.mockResolvedValue(1);
    expect(await rerunEvaluationResults({ batchId: "batch-1", mode: "SELECTED", resultIds: ["r-2"] })).toEqual({ affected: 1 });
    expect(mocks.resultUpdateMany).toHaveBeenCalledWith({ where: { evaluationBatchId: "batch-1", id: { in: ["r-2"] } }, data: expect.objectContaining({ status: "PENDING", reward: null, evaluatedAt: null }) });
  });

  it("does not delete running batches", async () => {
    mocks.getDemoRole.mockResolvedValue("ADMIN"); mocks.batchFindUnique.mockResolvedValue({ id: "batch-1", name: "Run", status: "RUNNING", taskId: "task-1", task: { projectId: "project-1" }, _count: { results: 2 } });
    expect(await deleteEvaluationBatch("batch-1")).toEqual({ error: "Cannot delete a running batch." });
    expect(mocks.batchDelete).not.toHaveBeenCalled();
  });
});
