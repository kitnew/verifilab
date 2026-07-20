import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTaskImport, planTaskImport, type DuplicateStrategy, type TaskImportFormat } from "@/lib/task-import";

export class TaskImportError extends Error {}

export async function previewProjectTaskImport(projectId: string, content: string, format: TaskImportFormat) {
  const existing = await projectTasks(projectId);
  return parseTaskImport(content, format, existing);
}

export async function confirmProjectTaskImport(input: { projectId: string; filename: string; content: string; format: TaskImportFormat; duplicateStrategy: DuplicateStrategy }) {
  const existing = await projectTasks(input.projectId);
  const preview = parseTaskImport(input.content, input.format, existing);
  if (preview.error) throw new TaskImportError(preview.error);
  const plan = planTaskImport(preview, input.duplicateStrategy);
  const rejectedRows = preview.rows.filter((row) => !row.task).map(({ rowNumber, errors, raw }) => ({ rowNumber, errors, raw }));

  return prisma.$transaction(async (tx) => {
    const record = await tx.taskImport.create({ data: {
      projectId: input.projectId,
      filename: input.filename,
      format: input.format,
      status: "COMPLETED",
      totalCount: plan.counts.total,
      importedCount: plan.counts.imported,
      skippedCount: plan.counts.skipped,
      duplicateCount: plan.counts.duplicate,
      failedCount: plan.counts.failed,
      rejectedRows: rejectedRows as Prisma.InputJsonValue,
      completedAt: new Date(),
    } });
    for (const task of plan.tasks) {
      const verifierConfig = task.verifierConfig as Prisma.InputJsonValue;
      await tx.task.create({ data: {
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
      } });
    }
    return { importId: record.id, ...plan.counts };
  });
}

async function projectTasks(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: {
    tasks: { select: { title: true, prompt: true, verifierType: true, verifierConfig: true, difficulty: true, tags: true } },
  } });
  if (!project) throw new TaskImportError("Project not found.");
  return project.tasks.map((task) => ({ ...task, verifierConfig: task.verifierConfig, tags: Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === "string") : [] }));
}
