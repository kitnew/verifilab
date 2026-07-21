import { describe, expect, it } from "vitest";
import { hashPassword, safeSecretEqual, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores a salted scrypt hash and verifies only the original password", async () => {
    const first = await hashPassword("correct-horse-42");
    const second = await hashPassword("correct-horse-42");

    expect(first).not.toBe(second);
    expect(first).not.toContain("correct-horse-42");
    await expect(verifyPassword("correct-horse-42", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password-42", first)).resolves.toBe(false);
  });

  it("rejects malformed hashes and compares bootstrap secrets safely", async () => {
    await expect(verifyPassword("anything", "broken")).resolves.toBe(false);
    expect(safeSecretEqual("same", "same")).toBe(true);
    expect(safeSecretEqual("same", "different")).toBe(false);
  });
});
