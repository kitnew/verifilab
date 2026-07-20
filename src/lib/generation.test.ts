import { describe, expect, it } from "vitest";
import { generateTasks, generationRequestSchema, generatorTypes, MAX_BATCH_SIZE } from "./generation";
import { verify } from "./verifier";

const base = { projectId: "project-1", count: 3, difficulty: "MEDIUM" as const, seed: "stable-seed" };

describe.each(generatorTypes)("%s generator", (generatorType) => {
  it("generates verifiable tasks", () => {
    const tasks = generateTasks({ ...base, generatorType }, "batch-1");
    expect(tasks).toHaveLength(3);
    expect(tasks.every((task) => verify(task.expectedAnswer, { type: task.verifierType, config: task.verifierConfig } as Parameters<typeof verify>[1]).passed)).toBe(true);
    expect(tasks[0]).toMatchObject({ generatorTemplate: generatorType, generatorVersion: 1, seed: base.seed, generationBatchId: "batch-1" });
  });

  it("is deterministic for the same version and seed", () => {
    const first = generateTasks({ ...base, generatorType }, "batch");
    const second = generateTasks({ ...base, generatorType }, "batch");
    expect(second).toEqual(first);
  });
});

it("rejects batches above the maximum", () => {
  expect(generationRequestSchema.safeParse({ ...base, generatorType: "ARITHMETIC", count: MAX_BATCH_SIZE + 1 }).success).toBe(false);
});
