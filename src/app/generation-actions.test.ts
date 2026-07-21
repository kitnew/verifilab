import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTasks, generationFingerprint } from "@/lib/generation";

const mocks = vi.hoisted(() => ({
  getProjectActor: vi.fn().mockResolvedValue({ id: "admin", name: "Ada Admin", role: "ADMIN" }),
  projectFindUnique: vi.fn(),
  jobCreate: vi.fn(),
  jobFindUnique: vi.fn(),
  jobUpdate: vi.fn(),
  taskFindMany: vi.fn(),
  taskCreate: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getProjectActor: mocks.getProjectActor }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.projectFindUnique },
  generationJob: { create: mocks.jobCreate, findUnique: mocks.jobFindUnique, update: mocks.jobUpdate },
  task: { findMany: mocks.taskFindMany, create: mocks.taskCreate },
  $transaction: mocks.transaction,
} }));

import { cancelGenerationJob, persistGeneratedTasks, previewGeneration, retryGenerationJob } from "./generation-actions";

const request = { projectId: "project-1", generatorType: "ARITHMETIC" as const, count: 2, difficulty: "EASY" as const, seed: "seed" };

describe("generation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindUnique.mockResolvedValue({ id: "project-1" });
    mocks.jobCreate.mockResolvedValue({ id: "job-1" });
    mocks.jobUpdate.mockResolvedValue({});
    mocks.taskFindMany.mockResolvedValue([]);
    mocks.transaction.mockResolvedValue([]);
  });

  it("validates the maximum batch size before database access", async () => {
    expect(await previewGeneration({ ...request, count: 101 })).toEqual({ error: "Maximum batch size is 100." });
    expect(mocks.projectFindUnique).not.toHaveBeenCalled();
  });

  it("marks project duplicates in the preview", async () => {
    const generated = generateTasks(request, "job-1");
    mocks.taskFindMany.mockResolvedValue([{ generationFingerprint: generationFingerprint(generated[0]) }]);

    const result = await previewGeneration(request);

    expect(result.tasks?.map((task) => task.duplicate)).toEqual([true, false]);
    expect(mocks.jobUpdate).toHaveBeenLastCalledWith({ where: { id: "job-1" }, data: expect.objectContaining({ status: "COMPLETED", generatedCount: 2, progress: 100 }) });
  });

  it("rechecks duplicates when persisting selected drafts", async () => {
    const generated = generateTasks(request, "job-1");
    mocks.jobFindUnique.mockResolvedValue({ id: "job-1", ...request, requestedCount: 2, status: "COMPLETED" });
    mocks.taskFindMany.mockResolvedValue([{ generationFingerprint: generationFingerprint(generated[0]) }]);

    const result = await persistGeneratedTasks({ jobId: "job-1", indices: [0, 1] });

    expect(result).toEqual({ created: 1, duplicates: [generated[0].title] });
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.taskCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ title: generated[1].title, status: "DRAFT", generationBatchId: "job-1" }) });
  });

  it("cancels only jobs without persisted tasks", async () => {
    mocks.jobFindUnique.mockResolvedValue({ id: "job-1", status: "COMPLETED", _count: { tasks: 1 } });
    expect(await cancelGenerationJob("job-1")).toEqual({ error: "A job with saved tasks cannot be cancelled." });
    expect(mocks.jobUpdate).not.toHaveBeenCalled();
  });

  it("retries a cancelled job with the same inputs", async () => {
    mocks.jobFindUnique.mockResolvedValue({ ...request, requestedCount: 2, status: "CANCELLED" });
    const result = await retryGenerationJob("old-job");
    expect(result.jobId).toBe("job-1");
    expect(result.tasks).toHaveLength(2);
  });
});
