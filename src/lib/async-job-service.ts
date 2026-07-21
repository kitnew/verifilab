import { createHash } from "node:crypto";
import { Prisma, type AsyncJobType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canRetryJob, safeJobError } from "@/lib/async-job";
import { buildDatasetRelease } from "@/lib/dataset-release-service";
import { datasetReleaseSchema } from "@/lib/dataset-release";
import { generationRequestSchema } from "@/lib/generation";
import { runGenerationPreview } from "@/lib/generation-service";
import { prisma } from "@/lib/prisma";
import { columnMappingSchema } from "@/lib/task-import";
import { confirmProjectTaskImport } from "@/lib/task-import-service";

const importInputSchema = z.object({
  projectId: z.string().min(1), filename: z.string().min(1), content: z.string(), format: z.enum(["CSV", "JSON", "JSONL"]),
  duplicateStrategy: z.enum(["SKIP", "REPLACE", "CREATE_NEW"]), mapping: columnMappingSchema.optional(), assignedAuthorId: z.string().optional(),
});
const releaseInputSchema = z.object({ datasetId: z.string().min(1), data: datasetReleaseSchema });

export async function createAsyncJob(input: { projectId: string; initiatorId: string; type: AsyncJobType; payload: Prisma.InputJsonValue; inputSummary: string; retrySourceId?: string }) {
  const fingerprint = createHash("sha256").update(JSON.stringify([input.type, input.projectId, input.initiatorId, input.payload])).digest("hex");
  const existing = await prisma.asyncJob.findUnique({ where: { idempotencyKey: fingerprint }, select: { id: true } });
  if (existing) return { id: existing.id, duplicate: true };
  try {
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.asyncJob.create({ data: { projectId: input.projectId, initiatorId: input.initiatorId, type: input.type, input: input.payload, inputSummary: input.inputSummary, retrySourceId: input.retrySourceId, idempotencyKey: fingerprint } });
      await tx.auditEvent.create({ data: { projectId: input.projectId, action: "JOB_CREATED", metadata: { jobId: created.id, type: created.type, initiatorId: input.initiatorId } } });
      return created;
    });
    return { id: job.id, duplicate: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.asyncJob.findUnique({ where: { idempotencyKey: fingerprint }, select: { id: true } });
      if (duplicate) return { id: duplicate.id, duplicate: true };
    }
    throw error;
  }
}

export async function executeAsyncJob(jobId: string) {
  const startedAt = new Date();
  const claimed = await prisma.asyncJob.updateMany({ where: { id: jobId, status: "QUEUED", cancellationRequestedAt: null }, data: { status: "RUNNING", progress: 1, startedAt } });
  if (!claimed.count) return;
  const job = await prisma.asyncJob.findUniqueOrThrow({ where: { id: jobId } });
  await prisma.auditEvent.create({ data: { projectId: job.projectId, action: "JOB_STARTED", metadata: { jobId, type: job.type } } });
  try {
    await checkpoint(jobId, 10);
    const resultReference = await dispatch(job);
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.asyncJob.update({ where: { id: jobId }, data: { status: "COMPLETED", progress: 100, resultReference, completedAt, idempotencyKey: null } }),
      prisma.auditEvent.create({ data: { projectId: job.projectId, action: "JOB_COMPLETED", metadata: { jobId, type: job.type, result: resultReference } } }),
    ]);
  } catch (error) {
    if (error instanceof JobCancelled) return cancelRunning(jobId, job.projectId);
    await prisma.$transaction([
      prisma.asyncJob.update({ where: { id: jobId }, data: { status: "FAILED", safeErrorMessage: safeJobError(error), completedAt: new Date(), idempotencyKey: null } }),
      prisma.auditEvent.create({ data: { projectId: job.projectId, action: "JOB_FAILED", metadata: { jobId, type: job.type } } }),
    ]);
  } finally {
    revalidateJobPaths(job.projectId);
  }
}

async function dispatch(job: { id: string; type: AsyncJobType; input: Prisma.JsonValue; initiatorId: string | null }) {
  if (!job.initiatorId) throw new Error("Job initiator no longer exists.");
  if (job.type === "BATCH_TASK_GENERATION") {
    const input = generationRequestSchema.parse(job.input);
    const result = await runGenerationPreview(input);
    return { kind: "GENERATION_JOB", id: result.id, href: `/dashboard/generation?job=${result.id}` } satisfies Prisma.InputJsonObject;
  }
  if (job.type === "BULK_IMPORT") {
    const input = importInputSchema.parse(job.input);
    const result = await confirmProjectTaskImport(input);
    return { kind: "TASK_IMPORT", id: result.importId, href: `/dashboard/imports/${result.importId}` } satisfies Prisma.InputJsonObject;
  }
  if (job.type === "DATASET_RELEASE") {
    const input = releaseInputSchema.parse(job.input);
    const result = await buildDatasetRelease(input.datasetId, input.data, job.initiatorId);
    return { kind: "DATASET_RELEASE", id: result.id, href: `/dashboard/datasets/${input.datasetId}/releases/${result.id}` } satisfies Prisma.InputJsonObject;
  }
  throw new Error("This job type is not connected to an executor.");
}

export async function requestJobCancellation(jobId: string, actorId: string) {
  const job = await prisma.asyncJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "QUEUED") return cancelRunning(job.id, job.projectId, actorId);
  if (job.status !== "RUNNING") return false;
  await prisma.asyncJob.update({ where: { id: jobId }, data: { cancellationRequestedAt: new Date(), cancelledById: actorId } });
  return true;
}

export async function retryAsyncJob(sourceId: string, actorId: string) {
  const source = await prisma.asyncJob.findUniqueOrThrow({ where: { id: sourceId } });
  if (!canRetryJob(source.status)) return null;
  const retried = await createAsyncJob({ projectId: source.projectId, initiatorId: actorId, type: source.type, payload: source.input as Prisma.InputJsonValue, inputSummary: source.inputSummary, retrySourceId: source.id });
  if (!retried.duplicate) await prisma.auditEvent.create({ data: { projectId: source.projectId, action: "JOB_RETRIED", metadata: { sourceJobId: source.id, jobId: retried.id, actorId } } });
  return retried;
}

async function checkpoint(jobId: string, progress: number) {
  const job = await prisma.asyncJob.findUniqueOrThrow({ where: { id: jobId }, select: { cancellationRequestedAt: true } });
  if (job.cancellationRequestedAt) throw new JobCancelled();
  await prisma.asyncJob.update({ where: { id: jobId }, data: { progress } });
}

async function cancelRunning(jobId: string, projectId: string, actorId?: string) {
  const now = new Date();
  const changed = await prisma.asyncJob.updateMany({ where: { id: jobId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", completedAt: now, cancelledAt: now, ...(actorId ? { cancelledById: actorId } : {}), cancellationRequestedAt: now, idempotencyKey: null } });
  if (changed.count) await prisma.auditEvent.create({ data: { projectId, action: "JOB_CANCELLED", metadata: { jobId, actorId } } });
  return Boolean(changed.count);
}

function revalidateJobPaths(projectId: string) {
  revalidatePath("/dashboard/jobs"); revalidatePath(`/dashboard/projects/${projectId}`); revalidatePath("/dashboard/tasks"); revalidatePath("/dashboard/imports"); revalidatePath("/dashboard/datasets"); revalidatePath("/dashboard/activity");
}

class JobCancelled extends Error {}
