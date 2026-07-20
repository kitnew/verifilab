import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findManyTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  findDataset: vi.fn(),
  createDatasetItem: vi.fn(),
  createAudit: vi.fn(),
  createComment: vi.fn(),
  createRun: vi.fn(),
  transaction: vi.fn(),
  getDemoRole: vi.fn().mockResolvedValue("REVIEWER"),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/demo-role", () => ({ COOKIE_NAME: "verifilab-role", getDemoRole: mocks.getDemoRole }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findUnique: mocks.findUnique, findMany: mocks.findManyTasks, create: mocks.createTask, update: mocks.updateTask, delete: mocks.deleteTask },
    dataset: { findUnique: mocks.findDataset },
    datasetItem: { create: mocks.createDatasetItem },
    auditEvent: { create: mocks.createAudit },
    reviewComment: { create: mocks.createComment },
    verificationRun: { create: mocks.createRun },
    $transaction: mocks.transaction,
  },
}));

import { bulkTaskAction, changeTaskStatus, duplicateTask, runVerification } from "./actions";

describe("runVerification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates, verifies, persists, and revalidates a passing run", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      verifierType: "EXACT_MATCH",
      verifierConfig: { expected: "Bucharest", caseSensitive: false, trimWhitespace: true },
    });
    mocks.createRun.mockResolvedValue({ id: "run-1" });

    const response = await runVerification("task-1", " bucharest ");

    expect(response.result).toMatchObject({ passed: true, reward: 1, normalizedCandidate: "bucharest" });
    expect(mocks.createRun).toHaveBeenCalledWith({
      data: expect.objectContaining({ taskId: "task-1", candidate: " bucharest ", passed: true }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/projects/project-1/tasks/task-1");
  });

  it("rejects oversized candidates before querying the database", async () => {
    const response = await runVerification("task-1", "x".repeat(10_001));
    expect(response).toEqual({ error: "Candidate response is too long" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid stored verifier configuration without persisting", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      verifierType: "REGEX",
      verifierConfig: { pattern: "[", flags: "" },
    });

    expect(await runVerification("task-1", "candidate")).toEqual({
      error: "This task has an invalid verifier configuration.",
    });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("returns a clear persistence error", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      verifierType: "NUMERIC",
      verifierConfig: { expected: 42, tolerance: 0 },
    });
    mocks.createRun.mockRejectedValue(new Error("database unavailable"));

    expect(await runVerification("task-1", "42")).toEqual({
      error: "Verification ran, but the result could not be saved.",
    });
  });
});

describe("changeTaskStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists an approval comment in the review timeline", async () => {
    mocks.findUnique.mockResolvedValue({ id: "task-1", projectId: "project-1", status: "IN_REVIEW" });
    mocks.transaction.mockResolvedValue([]);

    expect(await changeTaskStatus("task-1", "APPROVE", "  Looks good.  ")).toEqual({});
    expect(mocks.createComment).toHaveBeenCalledWith({
      data: { taskId: "task-1", author: "Reviewer (demo)", body: "Looks good." },
    });
  });
});

describe("duplicateTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an isolated draft copy with an audit event", async () => {
    mocks.getDemoRole.mockResolvedValue("AUTHOR");
    mocks.findUnique.mockResolvedValue({
      projectId: "project-1",
      title: "Original",
      prompt: "Prompt",
      verifierType: "REGEX",
      verifierConfig: { pattern: "^yes$", flags: "i" },
      difficulty: "HARD",
      tags: ["logic"],
    });
    mocks.createTask.mockResolvedValue({ id: "task-copy" });

    await duplicateTask("task-1");

    expect(mocks.createTask).toHaveBeenCalledWith({ data: {
      projectId: "project-1",
      title: "Copy of Original",
      prompt: "Prompt",
      verifierType: "REGEX",
      verifierConfig: { pattern: "^yes$", flags: "i" },
      difficulty: "HARD",
      status: "DRAFT",
      tags: ["logic"],
      auditEvents: { create: { projectId: "project-1", action: "TASK_DUPLICATED", metadata: { sourceTaskId: "task-1" } } },
    } });
  });
});

describe("bulkTaskAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDemoRole.mockResolvedValue("AUTHOR");
    mocks.transaction.mockResolvedValue([]);
  });

  it("submits valid drafts and reports invalid task transitions", async () => {
    mocks.findManyTasks.mockResolvedValue([
      { id: "draft", projectId: "project-1", title: "Draft", status: "DRAFT", tags: [] },
      { id: "approved", projectId: "project-1", title: "Approved", status: "APPROVED", tags: [] },
    ]);

    const result = await bulkTaskAction({ operation: "SUBMIT", taskIds: ["draft", "approved", "missing"] });

    expect(result.succeeded).toEqual([{ taskId: "draft", title: "Draft" }]);
    expect(result.failures).toEqual([
      { taskId: "approved", title: "Approved", error: "Cannot submit a task with status APPROVED." },
      { taskId: "missing", title: "missing", error: "Task not found." },
    ]);
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
  });

  it("merges tags without duplicates", async () => {
    mocks.findManyTasks.mockResolvedValue([{ id: "task-1", projectId: "project-1", title: "Task", status: "DRAFT", tags: ["old"] }]);

    expect(await bulkTaskAction({ operation: "ADD_TAGS", taskIds: ["task-1"], tags: "old, new" })).toMatchObject({ failures: [], succeeded: [{ taskId: "task-1" }] });
    expect(mocks.updateTask).toHaveBeenCalledWith({ where: { id: "task-1" }, data: { tags: ["old", "new"] } });
  });

  it("reports a per-task failure when merged tags exceed the task limit", async () => {
    mocks.findManyTasks.mockResolvedValue([{ id: "task-1", projectId: "project-1", title: "Task", status: "DRAFT", tags: ["x".repeat(300)] }]);

    const result = await bulkTaskAction({ operation: "ADD_TAGS", taskIds: ["task-1"], tags: "new" });

    expect(result.failures[0].error).toBe("Combined tags cannot exceed 300 characters.");
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("deletes drafts and rejects other statuses", async () => {
    mocks.findManyTasks.mockResolvedValue([
      { id: "draft", projectId: "project-1", title: "Draft", status: "DRAFT", tags: [] },
      { id: "review", projectId: "project-1", title: "Review", status: "IN_REVIEW", tags: [] },
    ]);

    const result = await bulkTaskAction({ operation: "DELETE_DRAFTS", taskIds: ["draft", "review"] });

    expect(result.succeeded).toEqual([{ taskId: "draft", title: "Draft" }]);
    expect(result.failures[0].error).toBe("Only draft tasks can be bulk deleted.");
    expect(mocks.deleteTask).toHaveBeenCalledWith({ where: { id: "draft" } });
  });

  it("adds only eligible, non-member tasks to a dataset", async () => {
    mocks.findManyTasks.mockResolvedValue([
      { id: "eligible", projectId: "project-1", title: "Eligible", status: "APPROVED", tags: [] },
      { id: "member", projectId: "project-1", title: "Member", status: "APPROVED", tags: [] },
      { id: "draft", projectId: "project-1", title: "Draft", status: "DRAFT", tags: [] },
    ]);
    mocks.findDataset.mockResolvedValue({ id: "dataset-1", projectId: "project-1", items: [{ taskId: "member", position: 2 }] });

    const result = await bulkTaskAction({ operation: "ADD_TO_DATASET", taskIds: ["eligible", "member", "draft"], datasetId: "dataset-1" });

    expect(result.succeeded).toEqual([{ taskId: "eligible", title: "Eligible" }]);
    expect(result.failures.map((failure) => failure.error)).toEqual(["Task is already in this dataset.", "Only approved tasks from this dataset's project can be added."]);
    expect(mocks.createDatasetItem).toHaveBeenCalledWith({ data: { datasetId: "dataset-1", taskId: "eligible", position: 3 } });
  });
});
