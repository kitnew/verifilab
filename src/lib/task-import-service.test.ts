import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  importFindUnique: vi.fn(),
  importCreate: vi.fn(),
  importUpdate: vi.fn(),
  taskCreate: vi.fn(),
  taskFindUnique: vi.fn(),
  taskFindMany: vi.fn(),
  taskUpdate: vi.fn(),
  taskDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.projectFindUnique },
  taskImport: { findUnique: mocks.importFindUnique },
  task: { findMany: mocks.taskFindMany },
  $transaction: mocks.transaction,
} }));

import { confirmProjectTaskImport, previewProjectTaskImport, rollbackProjectTaskImport } from "./task-import-service";

const valid = {
  title: "Capital of France",
  prompt: "What is the capital city of France?",
  verifierType: "EXACT_MATCH",
  verifierConfig: { expected: "Paris", caseSensitive: false, trimWhitespace: true },
  difficulty: "EASY",
  tags: ["geography"],
};

describe("task import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindUnique.mockResolvedValue({ tasks: [] });
    mocks.importCreate.mockResolvedValue({ id: "import-1" });
    mocks.taskCreate.mockResolvedValue({ id: "task-1", updatedAt: new Date("2026-07-20T20:00:00.000Z") });
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work({
      taskImport: { create: mocks.importCreate, update: mocks.importUpdate },
      task: { create: mocks.taskCreate, findUnique: mocks.taskFindUnique, update: mocks.taskUpdate, deleteMany: mocks.taskDeleteMany },
    }));
  });

  it("keeps dry runs read-only", async () => {
    const preview = await previewProjectTaskImport("project-1", JSON.stringify([valid]), "JSON");
    expect(preview.validRows).toBe(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it("confirms only valid rows and persists final counts", async () => {
    const content = JSON.stringify([valid, { ...valid, prompt: "short" }]);
    const result = await confirmProjectTaskImport({ projectId: "project-1", filename: "tasks.json", format: "JSON", content, duplicateStrategy: "SKIP" });
    expect(result).toEqual({ importId: "import-1", total: 2, imported: 1, replaced: 0, skipped: 0, duplicate: 0, failed: 1 });
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "project-1", status: "DRAFT", title: valid.title }) }));
    expect(mocks.importCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ totalCount: 2, importedCount: 1, skippedCount: 0, failedCount: 1, status: "COMPLETED" }) });
  });

  it("skips duplicates on confirmation", async () => {
    mocks.projectFindUnique.mockResolvedValue({ tasks: [{ id: "existing-1", ...valid }] });
    const result = await confirmProjectTaskImport({ projectId: "project-1", filename: "tasks.jsonl", format: "JSONL", content: JSON.stringify(valid), duplicateStrategy: "SKIP" });
    expect(result).toMatchObject({ imported: 0, skipped: 1, duplicate: 1, failed: 0 });
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it("replaces a matching task and records its rollback snapshot", async () => {
    const existing = { id: "existing-1", ...valid, status: "APPROVED" };
    mocks.projectFindUnique.mockResolvedValue({ tasks: [existing] });
    mocks.taskFindUnique.mockResolvedValue(existing);
    mocks.taskUpdate.mockResolvedValue({ updatedAt: new Date("2026-07-20T20:30:00.000Z") });
    const result = await confirmProjectTaskImport({ projectId: "project-1", filename: "tasks.json", format: "JSON", content: JSON.stringify([valid]), duplicateStrategy: "REPLACE" });
    expect(result).toMatchObject({ imported: 1, replaced: 1, skipped: 0, duplicate: 1 });
    expect(mocks.taskCreate).not.toHaveBeenCalled();
    expect(mocks.taskUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "existing-1" }, data: expect.objectContaining({ difficulty: "EASY", tags: ["geography"] }) }));
    expect(mocks.importUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { changes: expect.objectContaining({ replaced: [expect.objectContaining({ id: "existing-1", before: existing })] }) } }));
  });

  it("rolls back unchanged created tasks", async () => {
    const updatedAt = "2026-07-20T20:00:00.000Z";
    mocks.importFindUnique.mockResolvedValue({ id: "import-1", projectId: "project-1", status: "COMPLETED", changes: { created: [{ id: "task-1", updatedAt }], replaced: [] } });
    mocks.taskFindMany.mockResolvedValue([{ id: "task-1", updatedAt: new Date(updatedAt), _count: { verificationRuns: 0, reviewComments: 0, datasetItems: 0, evaluationBatches: 0 } }]);
    expect(await rollbackProjectTaskImport("import-1")).toEqual({ importId: "import-1", deleted: 1, restored: 0 });
    expect(mocks.taskDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["task-1"] } } });
    expect(mocks.importUpdate).toHaveBeenCalledWith({ where: { id: "import-1" }, data: { status: "ROLLED_BACK", rolledBackAt: expect.any(Date) } });
  });

  it("refuses rollback after an imported task changes", async () => {
    mocks.importFindUnique.mockResolvedValue({ id: "import-1", projectId: "project-1", status: "COMPLETED", changes: { created: [{ id: "task-1", updatedAt: "2026-07-20T20:00:00.000Z" }], replaced: [] } });
    mocks.taskFindMany.mockResolvedValue([{ id: "task-1", updatedAt: new Date("2026-07-20T21:00:00.000Z"), _count: { verificationRuns: 0, reviewComments: 0, datasetItems: 0, evaluationBatches: 0 } }]);
    await expect(rollbackProjectTaskImport("import-1")).rejects.toThrow("changed after the import");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
