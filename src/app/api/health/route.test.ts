import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { GET } from "./route";

it("reports database readiness", async () => {
  mocks.queryRaw.mockResolvedValue([{ 1: 1 }]);
  const response = await GET();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
});

it("returns 503 when the database is unavailable", async () => {
  mocks.queryRaw.mockRejectedValue(new Error("offline"));
  expect((await GET()).status).toBe(503);
});
