import { describe, expect, it } from "vitest";
import { datasetContentDisposition, datasetExportFilename, datasetExportItems, isDatasetEligible, serializeDataset, type PositionedTask } from "./dataset";

const items: PositionedTask[] = [
  {
    position: 2,
    task: {
      id: "task-b",
      title: "Numeric task",
      prompt: "Return 42.",
      verifierType: "NUMERIC",
      verifierConfig: { expected: 42, tolerance: 0 },
      difficulty: "EASY",
      tags: ["math"],
      project: { id: "project-1", name: "STEM", description: "Reasoning tasks" },
    },
  },
  {
    position: 1,
    task: {
      id: "task-a",
      title: "Exact task",
      prompt: "Return yes.",
      verifierType: "EXACT_MATCH",
      verifierConfig: { expected: "yes" },
      difficulty: "MEDIUM",
      tags: null,
      project: { id: "project-1", name: "STEM", description: "Reasoning tasks" },
    },
  },
];

describe("dataset eligibility", () => {
  it("accepts only approved tasks from the dataset project", () => {
    expect(isDatasetEligible({ status: "APPROVED", projectId: "project-1" }, "project-1")).toBe(true);
    expect(isDatasetEligible({ status: "DRAFT", projectId: "project-1" }, "project-1")).toBe(false);
    expect(isDatasetEligible({ status: "IN_REVIEW", projectId: "project-1" }, "project-1")).toBe(false);
    expect(isDatasetEligible({ status: "REJECTED", projectId: "project-1" }, "project-1")).toBe(false);
    expect(isDatasetEligible({ status: "APPROVED", projectId: "project-2" }, "project-1")).toBe(false);
  });
});

describe("dataset export", () => {
  it("orders by position and emits the requested fields", () => {
    expect(datasetExportItems(items)).toEqual([
      {
        taskId: "task-a",
        title: "Exact task",
        prompt: "Return yes.",
        verifierType: "EXACT_MATCH",
        verifierConfig: { expected: "yes" },
        difficulty: "MEDIUM",
        tags: [],
        project: { id: "project-1", name: "STEM", description: "Reasoning tasks" },
      },
      expect.objectContaining({ taskId: "task-b", tags: ["math"] }),
    ]);
  });

  it("serializes deterministic JSONL with a final newline", () => {
    const first = serializeDataset(items, "jsonl");
    expect(first).toBe(serializeDataset([...items].reverse(), "jsonl"));
    expect(first.split("\n").filter(Boolean)).toHaveLength(2);
    expect(first.endsWith("\n")).toBe(true);
  });

  it("serializes an empty JSON array and empty JSONL", () => {
    expect(serializeDataset([], "json")).toBe("[]\n");
    expect(serializeDataset([], "jsonl")).toBe("");
  });

  it("creates safe deterministic filenames", () => {
    expect(datasetExportFilename(" STEM / Evaluation 2026 ", "jsonl")).toBe("stem-evaluation-2026.jsonl");
    expect(datasetExportFilename("数据", "json")).toBe("dataset.json");
    expect(datasetContentDisposition("STEM / Evaluation 2026", "jsonl")).toBe('attachment; filename="stem-evaluation-2026.jsonl"');
  });
});
