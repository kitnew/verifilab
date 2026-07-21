import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(),
  runGenerationPreview: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/generation-service", () => ({ runGenerationPreview: mocks.runGenerationPreview }));
vi.mock("@/lib/dataset-release-service", () => ({ buildDatasetRelease: vi.fn() }));
vi.mock("@/lib/task-import-service", () => ({ confirmProjectTaskImport: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  asyncJob: { findUnique: mocks.findUnique, findUniqueOrThrow: mocks.findUniqueOrThrow, updateMany: mocks.updateMany, update: mocks.update, create: mocks.create },
  auditEvent: { create: mocks.auditCreate }, $transaction: mocks.transaction,
} }));

import { createAsyncJob, executeAsyncJob } from "./async-job-service";

const payload = { projectId: "project", generatorType: "ARITHMETIC", count: 2, difficulty: "EASY", seed: "seed" };
const running = { id: "job", projectId: "project", initiatorId: "author", type: "BATCH_TASK_GENERATION" as const, input: payload, cancelledById: null };

describe("async job persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.updateMany.mockResolvedValue({ count: 1 }); mocks.findUniqueOrThrow.mockResolvedValue(running); mocks.findUnique.mockResolvedValue({ cancellationRequestedAt: null }); mocks.update.mockResolvedValue({}); mocks.auditCreate.mockResolvedValue({}); mocks.transaction.mockImplementation(async (items) => Array.isArray(items) ? Promise.all(items) : items({ asyncJob: { create: mocks.create }, auditEvent: { create: mocks.auditCreate } }));
  });

  it("deduplicates an active submission", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "existing" });
    expect(await createAsyncJob({ projectId: "project", initiatorId: "author", type: "BATCH_TASK_GENERATION", payload, inputSummary: "2 tasks" })).toEqual({ id: "existing", duplicate: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("links a completed job to its operation result", async () => {
    mocks.runGenerationPreview.mockResolvedValue({ id: "generation", duplicateCount: 0 });
    await executeAsyncJob("job");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "job" }, data: expect.objectContaining({ status: "COMPLETED", progress: 100, resultReference: { kind: "GENERATION_JOB", id: "generation", href: "/dashboard/generation?job=generation" } }) });
  });

  it("stores a safe failure instead of an internal exception", async () => {
    mocks.runGenerationPreview.mockRejectedValue(new Error("DATABASE_URL=secret stack trace"));
    await executeAsyncJob("job");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "job" }, data: expect.objectContaining({ status: "FAILED", safeErrorMessage: "The operation failed. Review the input and retry, or contact an administrator." }) });
  });
});
