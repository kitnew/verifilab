import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  importCreate: vi.fn(),
  taskCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.projectFindUnique },
  $transaction: mocks.transaction,
} }));

import { confirmProjectTaskImport, previewProjectTaskImport } from "./task-import-service";

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
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work({ taskImport: { create: mocks.importCreate }, task: { create: mocks.taskCreate } }));
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
    expect(result).toEqual({ importId: "import-1", total: 2, imported: 1, skipped: 0, duplicate: 0, failed: 1 });
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.taskCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "project-1", status: "DRAFT", title: valid.title }) });
    expect(mocks.importCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ totalCount: 2, importedCount: 1, skippedCount: 0, failedCount: 1, status: "COMPLETED" }) });
  });

  it("skips duplicates on confirmation", async () => {
    mocks.projectFindUnique.mockResolvedValue({ tasks: [valid] });
    const result = await confirmProjectTaskImport({ projectId: "project-1", filename: "tasks.jsonl", format: "JSONL", content: JSON.stringify(valid), duplicateStrategy: "SKIP" });
    expect(result).toMatchObject({ imported: 0, skipped: 1, duplicate: 1, failed: 0 });
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });
});
