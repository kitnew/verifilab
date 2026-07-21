import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), auditCreate: vi.fn(), callbacks: [] as (() => unknown)[] }));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => mocks.callbacks.push(callback) }));
vi.mock("@/lib/prisma", () => ({ prisma: { apiToken: { findUnique: mocks.findUnique, update: mocks.update }, auditEvent: { create: mocks.auditCreate } } }));

import { authenticateApiToken, generateApiToken, hashApiToken, verifyApiTokenHash } from "./api-token";

const raw = "vfl_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const record = { id: "token-1", projectId: "project-1", prefix: "vfl_abcdefgh", scopes: ["tasks:read"], expiresAt: null, revokedAt: null };
const request = () => new Request("http://localhost/api/v1/tasks", { headers: { Authorization: `Bearer ${raw}` } });

describe("API token cryptography", () => {
  it("generates recognizable random tokens and stores only a verifiable hash", () => {
    const generated = generateApiToken();
    expect(generated.raw).toMatch(/^vfl_[A-Za-z0-9_-]{43}$/);
    expect(generated.prefix).toBe(generated.raw.slice(0, 12));
    expect(generated.tokenHash).toBe(hashApiToken(generated.raw));
    expect(generated.tokenHash).not.toContain(generated.raw);
    expect(verifyApiTokenHash(generated.raw, generated.tokenHash)).toBe(true);
    expect(verifyApiTokenHash(`${generated.raw}x`, generated.tokenHash)).toBe(false);
  });
});

describe("API token authentication", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.callbacks.length = 0; mocks.findUnique.mockResolvedValue(record); mocks.update.mockResolvedValue({}); mocks.auditCreate.mockResolvedValue({}); });

  it("returns structured 401 errors for missing and invalid tokens", async () => {
    const missing = await authenticateApiToken(new Request("http://localhost"), "tasks:read");
    expect(missing.ok).toBe(false); if (!missing.ok) expect(await missing.response.json()).toEqual({ error: { code: "unauthorized", message: "A valid bearer token is required." } });
    mocks.findUnique.mockResolvedValueOnce(null);
    const invalid = await authenticateApiToken(request(), "tasks:read");
    expect(invalid.ok).toBe(false); if (!invalid.ok) expect(invalid.response.status).toBe(401);
  });

  it.each([
    [{ ...record, revokedAt: new Date() }, "token_revoked"],
    [{ ...record, expiresAt: new Date(Date.now() - 1_000) }, "token_expired"],
  ] as const)("rejects revoked or expired tokens", async (token, code) => {
    mocks.findUnique.mockResolvedValueOnce(token);
    const result = await authenticateApiToken(request(), "tasks:read");
    expect(result.ok).toBe(false); if (!result.ok) expect(await result.response.json()).toMatchObject({ error: { code } });
  });

  it("enforces scopes with a structured 403", async () => {
    const result = await authenticateApiToken(request(), "jobs:read");
    expect(result.ok).toBe(false); if (!result.ok) { expect(result.response.status).toBe(403); expect(await result.response.json()).toMatchObject({ error: { code: "insufficient_scope" } }); }
  });

  it("updates lastUsedAt after a successful authentication", async () => {
    const result = await authenticateApiToken(request(), "tasks:read");
    expect(result.ok).toBe(true); expect(mocks.update).not.toHaveBeenCalled();
    await Promise.all(mocks.callbacks.map((callback) => callback()));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "token-1" }, data: { lastUsedAt: expect.any(Date) } });
  });
});
