import type { Prisma } from "@prisma/client";
import { EVALUATION_CHUNK_SIZE, evaluationMetrics, evaluationResultFromVerification } from "@/lib/evaluation";
import { prisma } from "@/lib/prisma";
import { storedVerifierSchema } from "@/lib/validation";
import { verify, type Verifier, type VerificationResult } from "@/lib/verifier";

export type EvaluationRunResult = { ok: boolean; status?: "COMPLETED" | "CANCELLED"; error?: string };

export async function runEvaluationBatch(batchId: string): Promise<EvaluationRunResult> {
  const acquired = await prisma.evaluationBatch.updateMany({
    where: { id: batchId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), completedAt: null, errorMessage: null },
  });
  if (acquired.count !== 1) return { ok: false, error: "Batch is not queued or is already running." };

  const batch = await prisma.evaluationBatch.findUnique({
    where: { id: batchId },
    select: { id: true, taskId: true, task: { select: { projectId: true } }, verifierTypeSnapshot: true, verifierConfigSnapshot: true, requestedCount: true, importInvalidCount: true },
  });
  if (!batch) return { ok: false, error: "Evaluation batch not found." };
  const verifier = storedVerifierSchema.safeParse({ type: batch.verifierTypeSnapshot, config: batch.verifierConfigSnapshot });
  if (!verifier.success) return failBatch(batch, "The stored verifier snapshot is invalid.");

  await prisma.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_STARTED", metadata: { evaluationBatchId: batch.id } } });

  try {
    while (true) {
      const current = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { status: true } });
      if (current?.status === "CANCELLED") {
        await syncEvaluationCounters(batch.id, batch.importInvalidCount, batch.requestedCount);
        return { ok: true, status: "CANCELLED" };
      }
      if (current?.status !== "RUNNING") return { ok: false, error: "Evaluation batch stopped unexpectedly." };

      const pending = await prisma.evaluationResult.findMany({ where: { evaluationBatchId: batch.id, status: "PENDING" }, orderBy: { sequenceNumber: "asc" }, take: EVALUATION_CHUNK_SIZE, select: { id: true, candidateResponse: true } });
      if (pending.length === 0) break;
      const claimed = await prisma.evaluationResult.updateMany({ where: { id: { in: pending.map((result) => result.id) }, status: "PENDING" }, data: { status: "RUNNING" } });
      if (claimed.count !== pending.length) continue;

      const evaluated = pending.map((result) => ({ id: result.id, ...evaluateCandidateSafely(result.candidateResponse, verifier.data) }));
      await prisma.$transaction(async (transaction) => {
        for (const result of evaluated) {
          await transaction.evaluationResult.updateMany({ where: { id: result.id, status: "RUNNING" }, data: result.data });
        }
        await syncEvaluationCounters(batch.id, batch.importInvalidCount, batch.requestedCount, transaction);
      });
      // ponytail: yield once per bounded chunk so an in-process cancellation request can be observed.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    await syncEvaluationCounters(batch.id, batch.importInvalidCount, batch.requestedCount);
    const completed = await prisma.evaluationBatch.updateMany({ where: { id: batch.id, status: "RUNNING" }, data: { status: "COMPLETED", progress: 100, completedAt: new Date() } });
    if (completed.count !== 1) return { ok: true, status: "CANCELLED" };
    await prisma.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_COMPLETED", metadata: { evaluationBatchId: batch.id, requestedCount: batch.requestedCount } } });
    return { ok: true, status: "COMPLETED" };
  } catch {
    await prisma.evaluationResult.updateMany({ where: { evaluationBatchId: batch.id, status: "RUNNING" }, data: { status: "PENDING" } }).catch(() => undefined);
    return failBatch(batch, "Evaluation was interrupted and can be retried.");
  }
}

export function evaluateCandidateSafely(candidate: string, verifier: Verifier, execute: (candidate: string, verifier: Verifier) => VerificationResult = verify) {
  try {
    const result = evaluationResultFromVerification(execute(candidate, verifier));
    return { data: { ...result, evaluatedAt: new Date(), errorMessage: null } };
  } catch {
    return { data: { status: "ERROR" as const, passed: null, reward: null, details: null, normalizedCandidate: null, executionTimeMs: null, errorMessage: "Verifier execution failed.", evaluatedAt: new Date() } };
  }
}

export async function syncEvaluationCounters(batchId: string, importInvalidCount: number, requestedCount: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const results = await client.evaluationResult.findMany({ where: { evaluationBatchId: batchId }, select: { status: true, reward: true, executionTimeMs: true } });
  const metrics = evaluationMetrics(results, importInvalidCount);
  await client.evaluationBatch.update({ where: { id: batchId }, data: {
    processedCount: metrics.processed,
    passedCount: metrics.passed,
    failedCount: metrics.failed,
    invalidCount: metrics.invalid,
    errorCount: metrics.errors,
    progress: requestedCount ? Math.min(100, Math.round(metrics.processed / requestedCount * 100)) : 0,
  } });
  return metrics;
}

async function failBatch(batch: { id: string; taskId: string; task: { projectId: string } }, error: string): Promise<EvaluationRunResult> {
  await prisma.evaluationBatch.updateMany({ where: { id: batch.id, status: "RUNNING" }, data: { status: "FAILED", errorMessage: error, completedAt: new Date() } });
  await prisma.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_FAILED", metadata: { evaluationBatchId: batch.id, error } } });
  return { ok: false, error };
}
