import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectActor: vi.fn(),
  findDataset: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/demo-role", () => ({ getProjectActor: mocks.getProjectActor }));
vi.mock("@/lib/prisma", () => ({ prisma: { dataset: { findUnique: mocks.findDataset }, $transaction: mocks.transaction } }));

import { createDatasetRelease } from "./dataset-actions";

const input = { version: "1.0.0", notes: "", seed: "42", trainPercentage: 80, validationPercentage: 10, testPercentage: 10 };

describe("dataset release permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDataset.mockResolvedValue({ id: "dataset", projectId: "project", items: [{ task: { id: "task", status: "APPROVED", project: { id: "project", name: "P", description: "" } } }], releases: [] });
  });

  it("denies authors server-side", async () => {
    mocks.getProjectActor.mockResolvedValue({ id: "author", name: "Ari", role: "AUTHOR" });
    expect(await createDatasetRelease("dataset", input)).toEqual({ error: "Only a curator or administrator can create dataset releases." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a release snapshot containing a non-approved task", async () => {
    mocks.getProjectActor.mockResolvedValue({ id: "curator", name: "Casey", role: "CURATOR" });
    mocks.findDataset.mockResolvedValue({ id: "dataset", projectId: "project", items: [{ task: { id: "task", status: "IN_REVIEW", project: { id: "project", name: "P", description: "" } } }], releases: [] });
    expect(await createDatasetRelease("dataset", input)).toEqual({ error: "Only approved tasks may be included in a dataset release." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
