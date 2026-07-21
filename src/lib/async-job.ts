import type { Role } from "@/lib/review";

export const asyncJobTypes = ["BATCH_TASK_GENERATION", "BULK_IMPORT", "DATASET_RELEASE", "ROLLOUT_EVALUATION", "DATASET_QUALITY_SCAN"] as const;
export const asyncJobStatuses = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type AsyncJobTypeValue = (typeof asyncJobTypes)[number];
export type AsyncJobStatusValue = (typeof asyncJobStatuses)[number];

const authoringJobs: AsyncJobTypeValue[] = ["BATCH_TASK_GENERATION", "BULK_IMPORT"];
const reviewerJobs: AsyncJobTypeValue[] = ["ROLLOUT_EVALUATION", "DATASET_QUALITY_SCAN", "DATASET_RELEASE"];

export function canManageJob(role: Role, userId: string, job: { type: AsyncJobTypeValue; initiatorId: string | null }) {
  if (role === "ADMIN" || role === "OPERATOR" || role === "CURATOR") return true;
  if (role === "AUTHOR") return job.initiatorId === userId && authoringJobs.includes(job.type);
  return role === "REVIEWER" && reviewerJobs.includes(job.type);
}

export function transitionJob(status: AsyncJobStatusValue, action: "START" | "COMPLETE" | "FAIL" | "CANCEL") {
  const next: Partial<Record<AsyncJobStatusValue, Partial<Record<typeof action, AsyncJobStatusValue>>>> = {
    QUEUED: { START: "RUNNING", CANCEL: "CANCELLED" },
    RUNNING: { COMPLETE: "COMPLETED", FAIL: "FAILED", CANCEL: "CANCELLED" },
  };
  return next[status]?.[action] ?? null;
}

export function canRetryJob(status: AsyncJobStatusValue) {
  return status === "FAILED" || status === "CANCELLED";
}

export function canCancelJob(status: AsyncJobStatusValue) {
  return status === "QUEUED" || status === "RUNNING";
}

export function jobDuration(startedAt: Date | null, completedAt: Date | null, now = new Date()) {
  if (!startedAt) return null;
  return Math.max(0, (completedAt ?? now).getTime() - startedAt.getTime());
}

export function safeJobError(error: unknown) {
  if (error instanceof Error && ["TaskImportError", "DatasetReleaseError"].includes(error.name)) return error.message.slice(0, 300);
  return "The operation failed. Review the input and retry, or contact an administrator.";
}
