import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieDelete: vi.fn(), cookieSet: vi.fn(),
  sessionFind: vi.fn(), sessionDeleteMany: vi.fn(), workspaceDelete: vi.fn(), projectFind: vi.fn(), membershipFind: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: mocks.cookieGet, delete: mocks.cookieDelete, set: mocks.cookieSet }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  session: { findUnique: mocks.sessionFind, deleteMany: mocks.sessionDeleteMany },
  guestWorkspace: { delete: mocks.workspaceDelete },
  project: { findUnique: mocks.projectFind },
  projectMembership: { findUnique: mocks.membershipFind },
} }));

import { destroySession, getProjectActor } from "./auth";

describe("guest session isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue({ value: "token" });
  });

  it("deletes the entire temporary workspace on logout", async () => {
    mocks.sessionFind.mockResolvedValue({ user: { guestWorkspaceId: "guest-workspace" } });

    await destroySession();

    expect(mocks.workspaceDelete).toHaveBeenCalledWith({ where: { id: "guest-workspace" } });
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).toHaveBeenCalledWith("verifilab-session");
  });

  it("does not grant a guest access to a persistent project", async () => {
    mocks.sessionFind.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), user: { id: "guest", name: "Guest Admin", username: null, isAdmin: false, isActive: true, guestWorkspaceId: "guest-workspace", memberships: [{ role: "ADMIN" }] } });
    mocks.projectFind.mockResolvedValue({ guestWorkspaceId: null });

    await expect(getProjectActor("persistent-project")).resolves.toBeNull();
    expect(mocks.membershipFind).not.toHaveBeenCalled();
  });
});
