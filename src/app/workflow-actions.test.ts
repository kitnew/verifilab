import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getProjectActor: vi.fn(),
  taskFind: vi.fn(),
  taskUpdate: vi.fn(),
  membershipFind: vi.fn(),
  membershipFindMany: vi.fn(),
  membershipUpsert: vi.fn(),
  projectFind: vi.fn(),
  userFind: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser, getProjectActor: mocks.getProjectActor }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  task: { findUnique: mocks.taskFind, update: mocks.taskUpdate },
  projectMembership: { findUnique: mocks.membershipFind, findMany: mocks.membershipFindMany, upsert: mocks.membershipUpsert },
  project: { findUnique: mocks.projectFind },
  user: { findUnique: mocks.userFind },
  auditEvent: { create: mocks.auditCreate },
  $transaction: mocks.transaction,
} }));

import { assignTask, setProjectMembership } from "./workflow-actions";

describe("workflow assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectActor.mockResolvedValue({ id: "curator", name: "Casey", role: "CURATOR" });
    mocks.taskFind.mockResolvedValue({ id: "task", projectId: "project", assignedAuthorId: null, assignedReviewerId: null });
    mocks.membershipFindMany.mockResolvedValue([{ userId: "author", role: "AUTHOR" }, { userId: "reviewer", role: "REVIEWER" }]);
    mocks.transaction.mockResolvedValue([]);
  });

  it("assigns author and reviewer with assignment audits", async () => {
    expect(await assignTask("task", { authorId: "author", reviewerId: "reviewer", priority: "HIGH", dueDate: "2026-07-25" })).toEqual({});
    expect(mocks.taskUpdate).toHaveBeenCalledWith({ where: { id: "task" }, data: expect.objectContaining({ assignedAuthorId: "author", assignedReviewerId: "reviewer", priority: "HIGH", authorAssignedAt: expect.any(Date), reviewerAssignedAt: expect.any(Date) }) });
    expect(mocks.auditCreate.mock.calls.map(([call]) => call.data.action)).toEqual(["TASK_AUTHOR_ASSIGNED", "TASK_REVIEWER_ASSIGNED"]);
  });

  it("records reassignment from the previous contributor", async () => {
    mocks.taskFind.mockResolvedValue({ id: "task", projectId: "project", assignedAuthorId: "old-author", assignedReviewerId: "reviewer" });
    expect(await assignTask("task", { authorId: "author", reviewerId: "reviewer", priority: "MEDIUM", dueDate: "" })).toEqual({});
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "TASK_AUTHOR_ASSIGNED", metadata: expect.objectContaining({ from: "old-author", to: "author" }) }) });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("prevents assigning the author as reviewer", async () => {
    mocks.membershipFindMany.mockResolvedValue([{ userId: "same", role: "ADMIN" }]);
    expect(await assignTask("task", { authorId: "same", reviewerId: "same", priority: "MEDIUM", dueDate: "" })).toEqual({ error: "An author cannot review their own task." });
    expect(mocks.taskUpdate).not.toHaveBeenCalled();
  });
});

describe("project membership roles", () => {
  it("allows an admin to add or change a project-scoped role and audits it", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", isAdmin: true });
    mocks.getProjectActor.mockResolvedValue({ id: "admin", name: "Ada", role: "ADMIN" });
    mocks.projectFind.mockResolvedValue({ id: "project" });
    mocks.userFind.mockResolvedValue({ id: "author", name: "Ari" });
    mocks.membershipFind.mockResolvedValue({ role: "REVIEWER" });
    mocks.transaction.mockResolvedValue([]);
    expect(await setProjectMembership("project", "author", "AUTHOR")).toEqual({});
    expect(mocks.membershipUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { role: "AUTHOR" } }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "PROJECT_ROLE_CHANGED", metadata: expect.objectContaining({ from: "REVIEWER", to: "AUTHOR" }) }) });
  });
});
