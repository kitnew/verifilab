"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/demo-role";
import { createVerifierSnapshot, duplicateResponseCount, evaluationBatchSchema, removeDuplicateResponses, rerunRequestSchema, rerunStatuses } from "@/lib/evaluation";
import { syncEvaluationCounters } from "@/lib/evaluation-service";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";
import { storedVerifierSchema } from "@/lib/validation";

export type EvaluationActionResult = { error?: string; batchId?: string; affected?: number };

export async function createEvaluationBatch(input: unknown): Promise<EvaluationActionResult> {
  const role = await getDemoRole();
  if (!can(role, "CREATE_TASK")) return { error: "Your demo role cannot create evaluation batches." };
  const parsed = evaluationBatchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const task = await prisma.task.findUnique({ where: { id: parsed.data.taskId }, select: { id: true, projectId: true, title: true, prompt: true, verifierType: true, verifierConfig: true, updatedAt: true } });
  if (!task) return { error: "Task not found." };
  const verifier = storedVerifierSchema.safeParse({ type: task.verifierType, config: task.verifierConfig });
  if (!verifier.success) return { error: "This task has an invalid verifier configuration." };

  const snapshot = createVerifierSnapshot(task);
  const duplicateCount = duplicateResponseCount(parsed.data.candidates);
  const candidates = parsed.data.removeDuplicates ? removeDuplicateResponses(parsed.data.candidates) : parsed.data.candidates;
  const requestedCount = candidates.length + parsed.data.invalidCount;
  try {
    const batch = await prisma.$transaction(async (transaction) => {
      const created = await transaction.evaluationBatch.create({ data: {
        taskId: task.id,
        name: parsed.data.name,
        description: parsed.data.description,
        sourceType: parsed.data.sourceType,
        modelName: parsed.data.modelName || null,
        modelVersion: parsed.data.modelVersion || null,
        temperature: parsed.data.temperature ?? null,
        topP: parsed.data.topP ?? null,
        seed: parsed.data.seed ?? null,
        requestedCount,
        processedCount: parsed.data.invalidCount,
        importInvalidCount: parsed.data.invalidCount,
        invalidCount: parsed.data.invalidCount,
        duplicateCount,
        progress: requestedCount ? Math.round(parsed.data.invalidCount / requestedCount * 100) : 0,
        taskTitleSnapshot: snapshot.taskTitle,
        taskPromptSnapshot: snapshot.taskPrompt,
        verifierTypeSnapshot: snapshot.verifierType,
        verifierConfigSnapshot: snapshot.verifierConfig as Prisma.InputJsonValue,
        taskUpdatedAtSnapshot: snapshot.taskUpdatedAt,
        importFingerprint: parsed.data.importFingerprint || null,
        createdBy: role,
        results: { create: candidates.map((candidate, index) => ({
          sequenceNumber: index + 1,
          candidateResponse: candidate.response,
          modelName: candidate.modelName || parsed.data.modelName || null,
          modelVersion: candidate.modelVersion || parsed.data.modelVersion || null,
          temperature: candidate.temperature ?? parsed.data.temperature ?? null,
          seed: candidate.seed ?? parsed.data.seed ?? null,
          externalId: candidate.externalId || null,
          ...(candidate.metadata === undefined ? {} : { metadata: candidate.metadata as Prisma.InputJsonValue }),
        })) },
      } });
      await transaction.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "EVALUATION_BATCH_CREATED", metadata: { evaluationBatchId: created.id, requestedCount, sourceType: parsed.data.sourceType, duplicateCount } } });
      await transaction.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "EVALUATION_RESPONSES_IMPORTED", metadata: { evaluationBatchId: created.id, validCount: candidates.length, invalidCount: parsed.data.invalidCount } } });
      return created;
    });
    revalidateEvaluation(task.projectId, task.id, batch.id);
    return { batchId: batch.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This file was already imported for this task." };
    return { error: "Could not create the evaluation batch." };
  }
}

export async function queueEvaluationBatch(batchId: string): Promise<EvaluationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot run evaluations." };
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, taskId: true, task: { select: { projectId: true } } } });
  if (!batch) return { error: "Evaluation batch not found." };
  if (batch.status !== "DRAFT") return { error: "Only draft batches can be started." };
  const updated = await prisma.evaluationBatch.updateMany({ where: { id: batchId, status: "DRAFT" }, data: { status: "QUEUED", errorMessage: null } });
  if (updated.count !== 1) return { error: "Batch state changed. Refresh and try again." };
  revalidateEvaluation(batch.task.projectId, batch.taskId, batch.id);
  return {};
}

export async function cancelEvaluationBatch(batchId: string): Promise<EvaluationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot cancel evaluations." };
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, taskId: true, task: { select: { projectId: true } } } });
  if (!batch) return { error: "Evaluation batch not found." };
  if (!(["DRAFT", "QUEUED", "RUNNING"] as const).includes(batch.status as "DRAFT" | "QUEUED" | "RUNNING")) return { error: `Cannot cancel a ${batch.status.toLowerCase()} batch.` };
  const updated = await prisma.evaluationBatch.updateMany({ where: { id: batchId, status: batch.status }, data: { status: "CANCELLED", completedAt: new Date() } });
  if (updated.count !== 1) return { error: "Batch state changed. Refresh and try again." };
  await prisma.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_CANCELLED", metadata: { evaluationBatchId: batch.id } } });
  revalidateEvaluation(batch.task.projectId, batch.taskId, batch.id);
  return {};
}

export async function retryEvaluationBatch(batchId: string): Promise<EvaluationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot retry evaluations." };
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, taskId: true, importInvalidCount: true, requestedCount: true, task: { select: { projectId: true } } } });
  if (!batch) return { error: "Evaluation batch not found." };
  if (batch.status !== "FAILED" && batch.status !== "CANCELLED") return { error: "Only failed or cancelled batches can be retried." };
  await prisma.$transaction(async (transaction) => {
    await transaction.evaluationResult.updateMany({ where: { evaluationBatchId: batch.id, status: "RUNNING" }, data: { status: "PENDING" } });
    await syncEvaluationCounters(batch.id, batch.importInvalidCount, batch.requestedCount, transaction);
    await transaction.evaluationBatch.update({ where: { id: batch.id }, data: { status: "QUEUED", errorMessage: null, completedAt: null } });
  });
  revalidateEvaluation(batch.task.projectId, batch.taskId, batch.id);
  return {};
}

export async function rerunEvaluationResults(input: unknown): Promise<EvaluationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot rerun evaluations." };
  const parsed = rerunRequestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: parsed.data.batchId }, select: { id: true, status: true, taskId: true, importInvalidCount: true, requestedCount: true, task: { select: { projectId: true } } } });
  if (!batch) return { error: "Evaluation batch not found." };
  if (batch.status === "RUNNING" || batch.status === "QUEUED") return { error: "Wait for the current evaluation run to finish." };
  const where: Prisma.EvaluationResultWhereInput = parsed.data.mode === "SELECTED"
    ? { evaluationBatchId: batch.id, id: { in: parsed.data.resultIds } }
    : { evaluationBatchId: batch.id, status: { in: [...rerunStatuses(parsed.data.mode)] } };
  const affected = await prisma.evaluationResult.count({ where });
  if (!affected) return { error: "No results match this rerun selection." };

  await prisma.$transaction(async (transaction) => {
    await transaction.evaluationResult.updateMany({ where, data: { status: "PENDING", passed: null, reward: null, details: null, normalizedCandidate: null, executionTimeMs: null, errorMessage: null, evaluatedAt: null } });
    await syncEvaluationCounters(batch.id, batch.importInvalidCount, batch.requestedCount, transaction);
    await transaction.evaluationBatch.update({ where: { id: batch.id }, data: { status: "QUEUED", errorMessage: null, completedAt: null } });
    await transaction.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_RESULTS_RERUN", metadata: { evaluationBatchId: batch.id, affected, mode: parsed.data.mode } } });
  });
  revalidateEvaluation(batch.task.projectId, batch.taskId, batch.id);
  return { affected };
}

export async function deleteEvaluationBatch(batchId: string): Promise<EvaluationActionResult> {
  if (!can(await getDemoRole(), "DELETE_TASK")) return { error: "Your demo role cannot delete evaluation batches." };
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { id: true, name: true, status: true, taskId: true, task: { select: { projectId: true } }, _count: { select: { results: true } } } });
  if (!batch) return { error: "Evaluation batch not found." };
  if (batch.status === "RUNNING" || batch.status === "QUEUED" || batch.status === "FAILED") return { error: `Cannot delete a ${batch.status.toLowerCase()} batch.` };
  await prisma.$transaction([
    prisma.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_BATCH_DELETED", metadata: { evaluationBatchId: batch.id, batchName: batch.name, resultCount: batch._count.results } } }),
    prisma.evaluationBatch.delete({ where: { id: batch.id } }),
  ]);
  revalidatePath("/dashboard/evaluations");
  revalidatePath(`/dashboard/projects/${batch.task.projectId}/tasks/${batch.taskId}`);
  revalidatePath("/dashboard/activity");
  return {};
}

function revalidateEvaluation(projectId: string, taskId: string, batchId: string) {
  revalidatePath("/dashboard/evaluations");
  revalidatePath(`/dashboard/evaluations/${batchId}`);
  revalidatePath(`/dashboard/projects/${projectId}/tasks/${taskId}`);
  revalidatePath("/dashboard/activity");
}
