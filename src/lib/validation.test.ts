import { describe, expect, it } from "vitest";
import { projectSchema, taskSchema, toTaskData } from "./validation";

describe("projectSchema", () => {
  it("trims valid project input and rejects short names", () => {
    expect(projectSchema.parse({ name: "  Evaluation Lab  ", description: "  Drafts  " })).toEqual({
      name: "Evaluation Lab",
      description: "Drafts",
    });
    expect(projectSchema.safeParse({ name: "x", description: "" }).success).toBe(false);
  });
});

describe("task validation", () => {
  const base = {
    title: "Numeric evaluation",
    prompt: "Return the final value only.",
    verifierType: "NUMERIC" as const,
    difficulty: "MEDIUM" as const,
    status: "DRAFT" as const,
    tags: "math, benchmark, math",
    expectedText: "",
    expectedNumber: "42.5",
    tolerance: "0.01",
    pattern: "",
    flags: "",
  };

  it("builds numeric verifier config and deduplicates tags", () => {
    expect(toTaskData(base)).toMatchObject({
      verifierConfig: { expected: 42.5, tolerance: 0.01 },
      tags: ["math", "benchmark"],
    });
  });

  it("rejects negative tolerance and invalid regex", () => {
    expect(taskSchema.safeParse({ ...base, tolerance: "-1" }).success).toBe(false);
    expect(
      taskSchema.safeParse({ ...base, verifierType: "REGEX", pattern: "[", flags: "" }).success,
    ).toBe(false);
  });
});
