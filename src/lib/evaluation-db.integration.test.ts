import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";

it("cascade-deletes evaluation results with their batch", async () => {
  const directory = mkdtempSync(join(tmpdir(), "verifilab-evaluation-"));
  const databaseUrl = `file:${join(directory, "test.db")}`;
  execFileSync(resolve("node_modules/.bin/prisma"), ["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], { cwd: resolve("."), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "ignore" });
  const client = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const project = await client.project.create({ data: { name: "Cascade project" } });
    const task = await client.task.create({ data: { projectId: project.id, title: "Cascade task", prompt: "Return the exact value yes.", verifierType: "EXACT_MATCH", verifierConfig: { expected: "yes", caseSensitive: false, trimWhitespace: true }, difficulty: "EASY", tags: [] } });
    const batch = await client.evaluationBatch.create({ data: { taskId: task.id, name: "Cascade batch", sourceType: "MANUAL", requestedCount: 1, taskTitleSnapshot: task.title, taskPromptSnapshot: task.prompt, verifierTypeSnapshot: task.verifierType, verifierConfigSnapshot: task.verifierConfig as Prisma.InputJsonValue, taskUpdatedAtSnapshot: task.updatedAt, results: { create: { sequenceNumber: 1, candidateResponse: "yes" } } } });
    expect(await client.evaluationResult.count({ where: { evaluationBatchId: batch.id } })).toBe(1);
    await client.evaluationBatch.delete({ where: { id: batch.id } });
    expect(await client.evaluationResult.count({ where: { evaluationBatchId: batch.id } })).toBe(0);
  } finally {
    await client.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});
