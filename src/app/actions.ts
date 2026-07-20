"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { candidateSchema, projectSchema, storedVerifierSchema, taskSchema, toTaskData, type ProjectInput, type TaskInput } from "@/lib/validation";
import { verify, type VerificationResult } from "@/lib/verifier";

export type ActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

function invalid(error: { flatten: () => { fieldErrors: Record<string, string[]> } }): ActionResult {
  return { error: "Please fix the highlighted fields.", fieldErrors: error.flatten().fieldErrors };
}

export async function createProject(input: ProjectInput): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  let project;
  try {
    project = await prisma.project.create({
      data: {
        ...parsed.data,
        auditEvents: { create: { action: "PROJECT_CREATED", metadata: {} } },
      },
    });
  } catch {
    return { error: "Could not create the project. Please try again." };
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/projects/${project.id}`);
}

export async function createTask(projectId: string, input: TaskInput): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  let task;
  try {
    task = await prisma.task.create({
      data: {
        projectId,
        ...toTaskData(parsed.data),
        auditEvents: { create: { projectId, action: "TASK_CREATED", metadata: {} } },
      },
    });
  } catch {
    return { error: "Could not create the task. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}/tasks/${task.id}`);
}

export async function updateTask(taskId: string, projectId: string, input: TaskInput): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
  if (!task) return { error: "Task not found." };

  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: toTaskData(parsed.data) }),
      prisma.auditEvent.create({ data: { projectId, taskId, action: "TASK_UPDATED", metadata: {} } }),
    ]);
  } catch {
    return { error: "Could not update the task. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/tasks/${taskId}`);
  redirect(`/dashboard/projects/${projectId}/tasks/${taskId}`);
}

export async function deleteTask(taskId: string, projectId: string): Promise<ActionResult> {
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
  if (!task) return { error: "Task not found." };

  try {
    await prisma.task.delete({ where: { id: taskId } });
  } catch {
    return { error: "Could not delete the task. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}`);
}

export async function runVerification(taskId: string, candidate: string): Promise<{ error?: string; result?: VerificationResult }> {
  const parsedCandidate = candidateSchema.safeParse(candidate);
  if (!parsedCandidate.success) return { error: parsedCandidate.error.issues[0].message };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, verifierType: true, verifierConfig: true },
  });
  if (!task) return { error: "Task not found." };

  const parsedVerifier = storedVerifierSchema.safeParse({ type: task.verifierType, config: task.verifierConfig });
  if (!parsedVerifier.success) return { error: "This task has an invalid verifier configuration." };

  const result = verify(parsedCandidate.data, parsedVerifier.data);
  const details: Prisma.InputJsonObject = {
    reward: result.reward,
    details: result.details,
    executionTimeMs: result.executionTimeMs,
    ...(result.normalizedCandidate === undefined ? {} : { normalizedCandidate: result.normalizedCandidate }),
  };

  try {
    await prisma.verificationRun.create({
      data: { taskId, candidate: parsedCandidate.data, passed: result.passed, details },
    });
  } catch {
    return { error: "Verification ran, but the result could not be saved." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${task.id}`);
  return { result };
}
