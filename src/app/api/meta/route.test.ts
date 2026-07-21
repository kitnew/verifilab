import { expect, it } from "vitest";
import { GET } from "./route";

it("describes the deployed application", async () => {
  await expect(GET().json()).resolves.toEqual({ name: "VerifiLab", version: "0.1.0", runtime: "Next.js monolith", database: "SQLite via Prisma" });
});
