"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { canCancelJob, canManageJob } from "@/lib/async-job";
import { executeAsyncJob, requestJobCancellation, retryAsyncJob } from "@/lib/async-job-service";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Result = { error?: string; jobId?: string };

export async function cancelAsyncJob(jobId: string): Promise<Result> {
  const job = await prisma.asyncJob.findUnique({ where: { id: jobId }, select: { id: true, projectId: true, type: true, status: true, initiatorId: true } });
  if (!job) return { error: "Job not found." };
  const actor = await getProjectActor(job.projectId);
  if (!actor || !canManageJob(actor.role, actor.id, job)) return { error: "You cannot cancel this job." };
  if (!canCancelJob(job.status)) return { error: "Only queued or running jobs can be cancelled." };
  if (!await requestJobCancellation(job.id, actor.id)) return { error: "The job could not be cancelled." };
  revalidatePath(`/dashboard/jobs/${job.id}`); revalidatePath("/dashboard/jobs");
  return {};
}

export async function retryJob(jobId: string): Promise<Result> {
  const job = await prisma.asyncJob.findUnique({ where: { id: jobId }, select: { id: true, projectId: true, type: true, status: true, initiatorId: true } });
  if (!job) return { error: "Job not found." };
  const actor = await getProjectActor(job.projectId);
  if (!actor || !canManageJob(actor.role, actor.id, job)) return { error: "You cannot retry this job." };
  const retried = await retryAsyncJob(job.id, actor.id);
  if (!retried) return { error: "Only failed or cancelled jobs can be retried." };
  if (!retried.duplicate) after(() => executeAsyncJob(retried.id));
  revalidatePath("/dashboard/jobs");
  return { jobId: retried.id };
}
