import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createDatasetReleaseItems, datasetReleaseContentDisposition, datasetReleaseFilename, datasetReleaseSchema, releaseSplitCounts, releaseVersionIsUnique, serializeDatasetRelease, splitPercentagesSchema, type DatasetExportItem } from "./dataset-release";

const tasks: DatasetExportItem[] = Array.from({ length: 11 }, (_, index) => ({
  taskId: `task-${String(index + 1).padStart(2, "0")}`,
  title: `Task ${index + 1}`,
  prompt: `Return ${index + 1}.`,
  verifierType: "NUMERIC",
  verifierConfig: { expected: index + 1, tolerance: 0 },
  difficulty: "EASY",
  tags: ["math"],
  project: { id: "project-1", name: "STEM", description: "Reasoning" },
}));

const percentages = { trainPercentage: 70, validationPercentage: 20, testPercentage: 10 };

describe("dataset release validation", () => {
  it("requires non-negative integer percentages totaling exactly 100", () => {
    expect(splitPercentagesSchema.safeParse(percentages).success).toBe(true);
    expect(splitPercentagesSchema.safeParse({ trainPercentage: 80, validationPercentage: 10, testPercentage: 9 }).success).toBe(false);
    expect(splitPercentagesSchema.safeParse({ trainPercentage: -1, validationPercentage: 1, testPercentage: 100 }).success).toBe(false);
  });

  it("accepts SemVer and detects an existing dataset version", () => {
    expect(datasetReleaseSchema.safeParse({ version: "1.2.3-beta.1+build.5", notes: "", seed: "42", ...percentages }).success).toBe(true);
    expect(datasetReleaseSchema.safeParse({ version: "01.2.3", notes: "", seed: "42", ...percentages }).success).toBe(false);
    expect(releaseVersionIsUnique(["1.0.0", "1.1.0"], "1.1.0")).toBe(false);
    expect(releaseVersionIsUnique(["1.0.0"], "2.0.0")).toBe(true);
  });

  it("enforces semantic version uniqueness per dataset in the database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "verifilab-release-"));
    const databaseUrl = `file:${join(directory, "test.db")}`;
    execFileSync(resolve("node_modules/.bin/prisma"), ["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "ignore" });
    const client = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      const project = await client.project.create({ data: { name: "Release test" } });
      const dataset = await client.dataset.create({ data: { projectId: project.id, name: "Dataset" } });
      const release = { datasetId: dataset.id, version: "1.0.0", seed: "42", trainPercentage: 80, validationPercentage: 10, testPercentage: 10, totalCount: 1, trainCount: 1, validationCount: 0, testCount: 0, items: [] };
      await client.datasetRelease.create({ data: release });
      await expect(client.datasetRelease.create({ data: release })).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await client.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("dataset release splitting", () => {
  it("previews deterministic largest-remainder counts", () => {
    expect(releaseSplitCounts(11, percentages)).toEqual({ train: 8, validation: 2, test: 1 });
    expect(releaseSplitCounts(1, { trainPercentage: 34, validationPercentage: 33, testPercentage: 33 })).toEqual({ train: 1, validation: 0, test: 0 });
  });

  it("produces identical assignments for the same snapshot and seed", () => {
    expect(createDatasetReleaseItems(tasks, percentages, "seed-42")).toEqual(createDatasetReleaseItems([...tasks].reverse(), percentages, "seed-42"));
  });

  it("assigns every task exactly once with complete split counts", () => {
    const released = createDatasetReleaseItems(tasks, percentages, "seed-42");
    expect(new Set(released.map((item) => item.taskId)).size).toBe(tasks.length);
    expect(released).toHaveLength(tasks.length);
    expect(released.filter((item) => item.split === "train")).toHaveLength(8);
    expect(released.filter((item) => item.split === "validation")).toHaveLength(2);
    expect(released.filter((item) => item.split === "test")).toHaveLength(1);
  });

  it("deep-clones snapshot data so source task edits cannot change it", () => {
    const source = structuredClone(tasks);
    const released = createDatasetReleaseItems(source, percentages, "immutable");
    source[0].title = "Edited later";
    source[0].verifierConfig = { expected: 999 };
    const snapshot = released.find((item) => item.taskId === source[0].taskId);
    expect(snapshot?.title).toBe("Task 1");
    expect(snapshot?.verifierConfig).toEqual({ expected: 1, tolerance: 0 });
  });
});

describe("dataset release export", () => {
  it("serializes deterministic full and split JSONL", () => {
    const released = createDatasetReleaseItems(tasks, percentages, "export");
    const full = serializeDatasetRelease(released, "all");
    const train = serializeDatasetRelease([...released].reverse(), "train");
    expect(full.trim().split("\n")).toHaveLength(11);
    expect(train.trim().split("\n")).toHaveLength(8);
    expect(train).toBe(serializeDatasetRelease(released, "train"));
    expect(train).toContain('"split":"train"');
    expect(train).not.toContain('"split":"test"');
  });

  it("creates safe split-specific filenames", () => {
    expect(datasetReleaseFilename("STEM / Evaluation", "1.2.0-beta.1", "validation")).toBe("verifilab-stem-evaluation-1-2-0-beta-1-validation.jsonl");
    expect(datasetReleaseContentDisposition("STEM", "1.0.0", "all")).toBe('attachment; filename="verifilab-stem-1-0-0-all.jsonl"');
  });
});
