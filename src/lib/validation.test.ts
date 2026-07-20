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

  it("stores explicit exact-match normalization defaults", () => {
    expect(
      toTaskData({ ...base, verifierType: "EXACT_MATCH", expectedText: "  Answer  " }).verifierConfig,
    ).toEqual({ expected: "Answer", caseSensitive: false, trimWhitespace: true });
  });

  it("rejects negative tolerance and invalid regex", () => {
    expect(taskSchema.safeParse({ ...base, tolerance: "-1" }).success).toBe(false);
    expect(
      taskSchema.safeParse({ ...base, verifierType: "REGEX", pattern: "[", flags: "" }).success,
    ).toBe(false);
  });

  it("validates and stores JSON Schema configuration", () => {
    const jsonSchema = '{"type":"object","required":["answer"],"properties":{"answer":{"type":"number"}}}';
    expect(toTaskData({ ...base, verifierType: "JSON_SCHEMA", jsonSchema }).verifierConfig).toEqual({ schema: JSON.parse(jsonSchema) });
    expect(taskSchema.safeParse({
      ...base,
      verifierType: "JSON_SCHEMA",
      jsonSchema: '{"type":"object","required":["answer"]}',
    }).success).toBe(true);
    expect(taskSchema.safeParse({ ...base, verifierType: "JSON_SCHEMA", jsonSchema: "{" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, verifierType: "JSON_SCHEMA", jsonSchema: '{"type":"not-a-type"}' }).success).toBe(false);
  });
});
