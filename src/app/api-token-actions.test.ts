import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getProjectActor: vi.fn(), tokenCreate: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getProjectActor: mocks.getProjectActor }));
vi.mock("@/lib/api-token", async () => ({ ...(await vi.importActual<typeof import("@/lib/api-token")>("@/lib/api-token")), generateApiToken: () => ({ raw: "vfl_one_time_secret", prefix: "vfl_one_time", tokenHash: "stored-hash" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { createProjectApiToken } from "./api-token-actions";

describe("API token creation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getProjectActor.mockResolvedValue({ id: "admin", role: "ADMIN", name: "Admin" });
    mocks.tokenCreate.mockResolvedValue({ id: "token-1", name: "CI", prefix: "vfl_one_time" }); mocks.auditCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation((callback) => callback({ apiToken: { create: mocks.tokenCreate }, auditEvent: { create: mocks.auditCreate } }));
  });

  it("returns plaintext once without persisting or auditing it", async () => {
    const result = await createProjectApiToken("project-1", { name: "CI", scopes: ["tasks:read"], expiresAt: "" });
    expect(result).toEqual({ rawToken: "vfl_one_time_secret", tokenId: "token-1" });
    const persisted = mocks.tokenCreate.mock.calls[0][0].data;
    expect(persisted).toMatchObject({ prefix: "vfl_one_time", tokenHash: "stored-hash" });
    expect(JSON.stringify(persisted)).not.toContain("vfl_one_time_secret");
    expect(JSON.stringify(mocks.auditCreate.mock.calls[0][0])).not.toContain("stored-hash");
    expect(JSON.stringify(mocks.auditCreate.mock.calls[0][0])).not.toContain("vfl_one_time_secret");
  });

  it("denies non-admin project roles", async () => {
    mocks.getProjectActor.mockResolvedValueOnce({ id: "curator", role: "CURATOR", name: "Curator" });
    expect(await createProjectApiToken("project-1", { name: "CI", scopes: ["tasks:read"] })).toEqual({ error: "Only a project administrator can manage API tokens." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
