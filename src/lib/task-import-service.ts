import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseTaskImport, planTaskImport, type ColumnMapping, type DuplicateStrategy, type TaskImportFormat } from "@/lib/task-import";

export class TaskImportError extends Error {}

const snapshotSchema = z.object({
  title: z.string(),
  prompt: z.string(),
  verifierType: z.enum(["EXACT_MATCH", "NUMERIC", "REGEX", "JSON_SCHEMA"]),
  verifierConfig: z.unknown(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"]),
  tags: z.unknown(),
});
const changesSchema = z.object({
  created: z.array(z.object({ id: z.string(), updatedAt: z.string() })),
  replaced: z.array(z.object({ id: z.string(), updatedAt: z.string(), before: snapshotSchema })),
});

export async function previewProjectTaskImport(projectId: string, content: string, format: TaskImportFormat, mapping?: ColumnMapping) {
  const existing = await projectTasks(projectId);
  return parseTaskImport(content, format, existing, mapping);
}

export async function confirmProjectTaskImport(input: { projectId: string; filename: string; content: string; format: TaskImportFormat; duplicateStrategy: DuplicateStrategy; mapping?: ColumnMapping }) {
  const existing = await projectTasks(input.projectId);
  const preview = parseTaskImport(input.content, input.format, existing, input.mapping);
  if (preview.error) throw new TaskImportError(preview.error);
  const plan = planTaskImport(preview, input.duplicateStrategy);
  const rejectedRows = preview.rows.filter((row) => !row.task).map(({ rowNumber, errors, raw }) => ({ rowNumber, errors, raw }));

  return prisma.$transaction(async (tx) => {
    const record = await tx.taskImport.create({ data: {
      projectId: input.projectId,
      filename: input.filename,
      format: input.format,
      status: "COMPLETED",
      strategy: input.duplicateStrategy,
      totalCount: plan.counts.total,
      importedCount: plan.counts.imported,
      replacedCount: plan.counts.replaced,
      skippedCount: plan.counts.skipped,
      duplicateCount: plan.counts.duplicate,
      failedCount: plan.counts.failed,
      rejectedRows: rejectedRows as Prisma.InputJsonValue,
      changes: { created: [], replaced: [] },
      completedAt: new Date(),
    } });
    const changes: z.infer<typeof changesSchema> = { created: [], replaced: [] };
    for (const task of plan.creates) {
      const verifierConfig = task.verifierConfig as Prisma.InputJsonValue;
      const created = await tx.task.create({ data: {
        projectId: input.projectId,
        title: task.title,
        prompt: task.prompt,
        verifierType: task.verifierType,
        verifierConfig,
        difficulty: task.difficulty,
        status: "DRAFT",
        tags: task.tags,
        verifierVersions: { create: { version: 1, verifierType: task.verifierType, verifierConfig, changeSummary: "Initial version (bulk import)" } },
        auditEvents: { create: [
          { projectId: input.projectId, action: "TASK_CREATED", metadata: { taskImportId: record.id, filename: input.filename } },
          { projectId: input.projectId, action: "VERIFIER_VERSION_CREATED", metadata: { version: 1 } },
        ] },
      }, select: { id: true, updatedAt: true } });
      changes.created.push({ id: created.id, updatedAt: created.updatedAt.toISOString() });
    }
    for (const replacement of plan.replacements) {
      const before = await tx.task.findUnique({ where: { id: replacement.taskId }, select: taskSnapshotSelect });
      if (!before) throw new TaskImportError("A duplicate task disappeared before it could be replaced.");
      const updated = await tx.task.update({
        where: { id: replacement.taskId },
        data: {
          title: replacement.task.title,
          prompt: replacement.task.prompt,
          verifierType: replacement.task.verifierType,
          verifierConfig: replacement.task.verifierConfig as Prisma.InputJsonValue,
          difficulty: replacement.task.difficulty,
          tags: replacement.task.tags,
          auditEvents: { create: { projectId: input.projectId, action: "TASK_UPDATED", metadata: { taskImportId: record.id, replacement: true } } },
        },
        select: { updatedAt: true },
      });
      changes.replaced.push({ id: replacement.taskId, updatedAt: updated.updatedAt.toISOString(), before });
    }
    await tx.taskImport.update({ where: { id: record.id }, data: { changes: changes as Prisma.InputJsonValue } });
    return { importId: record.id, ...plan.counts };
  });
}

export async function rollbackProjectTaskImport(importId: string) {
  const record = await prisma.taskImport.findUnique({ where: { id: importId }, select: { id: true, projectId: true, status: true, changes: true } });
  if (!record) throw new TaskImportError("Import not found.");
  if (record.status !== "COMPLETED") throw new TaskImportError("Only a completed import can be rolled back.");
  const parsed = changesSchema.safeParse(record.changes);
  if (!parsed.success) throw new TaskImportError("This import does not contain rollback metadata.");
  const expected = new Map([...parsed.data.created, ...parsed.data.replaced].map((task) => [task.id, task.updatedAt]));
  const current = await prisma.task.findMany({
    where: { id: { in: [...expected.keys()] } },
    select: { id: true, updatedAt: true, _count: { select: { verificationRuns: true, reviewComments: true, datasetItems: true, evaluationBatches: true } } },
  });
  if (current.length !== expected.size || current.some((task) => task.updatedAt.toISOString() !== expected.get(task.id))) {
    throw new TaskImportError("Rollback stopped because an affected task was changed after the import.");
  }
  const createdIds = new Set(parsed.data.created.map((task) => task.id));
  if (current.some((task) => createdIds.has(task.id) && Object.values(task._count).some((count) => count > 0))) {
    throw new TaskImportError("Rollback stopped because an imported task now has related runs, reviews, datasets, or evaluations.");
  }

  await prisma.$transaction(async (tx) => {
    if (createdIds.size) await tx.task.deleteMany({ where: { id: { in: [...createdIds] } } });
    for (const replacement of parsed.data.replaced) {
      await tx.task.update({
        where: { id: replacement.id },
        data: {
          ...replacement.before,
          verifierConfig: replacement.before.verifierConfig as Prisma.InputJsonValue,
          tags: replacement.before.tags as Prisma.InputJsonValue,
          auditEvents: { create: { projectId: record.projectId, action: "TASK_UPDATED", metadata: { taskImportId: record.id, rollback: true } } },
        },
      });
    }
    await tx.taskImport.update({ where: { id: record.id }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
  });
  return { importId, deleted: parsed.data.created.length, restored: parsed.data.replaced.length };
}

async function projectTasks(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: {
    tasks: { select: { id: true, title: true, prompt: true, verifierType: true, verifierConfig: true, difficulty: true, tags: true } },
  } });
  if (!project) throw new TaskImportError("Project not found.");
  return project.tasks;
}

const taskSnapshotSelect = {
  title: true,
  prompt: true,
  verifierType: true,
  verifierConfig: true,
  difficulty: true,
  status: true,
  tags: true,
} satisfies Prisma.TaskSelect;
