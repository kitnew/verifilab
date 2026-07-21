import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const userCreate = vi.fn();
  const membershipCreate = vi.fn();
  const auditCreate = vi.fn();
  return {
    getCurrentUser: vi.fn(), createSession: vi.fn(), destroySession: vi.fn(),
    findUser: vi.fn(), updateUser: vi.fn(), findProject: vi.fn(), transaction: vi.fn(),
    hashPassword: vi.fn(), verifyPassword: vi.fn(), safeSecretEqual: vi.fn(),
    redirect: vi.fn(), revalidatePath: vi.fn(), userCreate, membershipCreate, auditCreate,
    transactionClient: { user: { create: userCreate }, projectMembership: { create: membershipCreate }, auditEvent: { create: auditCreate } },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.createSession, destroySession: mocks.destroySession, getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/password", () => ({ hashPassword: mocks.hashPassword, verifyPassword: mocks.verifyPassword, safeSecretEqual: mocks.safeSecretEqual }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.findUser, update: mocks.updateUser },
  project: { findUnique: mocks.findProject },
  $transaction: mocks.transaction,
} }));

import { createAccount, login } from "./auth-actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("account authentication", () => {
  const previousBootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    mocks.hashPassword.mockResolvedValue("stored-hash");
    mocks.transaction.mockImplementation((callback) => callback(mocks.transactionClient));
  });

  afterEach(() => {
    if (previousBootstrapPassword === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = previousBootstrapPassword;
  });

  it("creates a session for valid credentials", async () => {
    mocks.findUser.mockResolvedValue({ id: "user-1", isAdmin: false, isActive: true, passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);

    expect(await login({}, form({ username: "author.one", password: "Password12345" }))).toEqual(undefined);
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects invalid credentials without creating a session", async () => {
    mocks.findUser.mockResolvedValue({ id: "user-1", isAdmin: false, isActive: true, passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(false);

    expect(await login({}, form({ username: "author.one", password: "wrong" }))).toEqual({ error: "Invalid username or password." });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("activates the seeded admin password only on its first login", async () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "BootstrapAdmin123";
    mocks.findUser.mockResolvedValue({ id: "admin", isAdmin: true, isActive: true, passwordHash: null });
    mocks.safeSecretEqual.mockReturnValue(true);

    await login({}, form({ username: "admin", password: "BootstrapAdmin123" }));

    expect(mocks.hashPassword).toHaveBeenCalledWith("BootstrapAdmin123");
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "admin" }, data: { passwordHash: "stored-hash" } });
    expect(mocks.createSession).toHaveBeenCalledWith("admin");
  });

  it("denies account creation to non-admin users", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "author", isAdmin: false });
    expect(await createAccount({}, form({ name: "New Author", username: "new.author", password: "Password12345", projectId: "project", role: "AUTHOR" }))).toEqual({ error: "Administrator access required." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates credentials, initial project membership and audit event for an admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", isAdmin: true });
    mocks.findProject.mockResolvedValue({ id: "project" });
    mocks.userCreate.mockResolvedValue({ id: "new-user", name: "New Reviewer", username: "new.reviewer" });

    const result = await createAccount({}, form({ name: "New Reviewer", username: "new.reviewer", password: "Password12345", projectId: "project", role: "REVIEWER" }));

    expect(result).toEqual({ success: "Account new.reviewer created." });
    expect(mocks.userCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ username: "new.reviewer", passwordHash: "stored-hash" }) });
    expect(mocks.membershipCreate).toHaveBeenCalledWith({ data: { projectId: "project", userId: "new-user", role: "REVIEWER" } });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCOUNT_CREATED", projectId: "project" }) });
  });
});
