"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { COOKIE_NAME, getDemoRole } from "@/lib/demo-role";
import { prisma } from "@/lib/prisma";
import { can, reviewTransition, roles, type ReviewAction, type Role } from "@/lib/review";
import { candidateSchema, projectSchema, reviewCommentSchema, storedVerifierSchema, taskSchema, toTaskData, type ProjectInput, type TaskInput } from "@/lib/validation";
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
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot create tasks." };
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
  if (!can(await getDemoRole(), "EDIT_TASK")) return { error: "Your demo role cannot edit tasks." };
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
  if (!can(await getDemoRole(), "DELETE_TASK")) return { error: "Your demo role cannot delete tasks." };
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

export async function setDemoRole(value: Role): Promise<ActionResult> {
  const parsed = z.enum(roles).safeParse(value);
  if (!parsed.success) return { error: "Invalid demo role." };
  (await cookies()).set(COOKIE_NAME, parsed.data, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/dashboard", "layout");
  return {};
}

export async function changeTaskStatus(taskId: string, action: ReviewAction, comment = ""): Promise<ActionResult> {
  const parsedAction = z.enum(["SUBMIT", "APPROVE", "REJECT", "REOPEN"]).safeParse(action);
  if (!parsedAction.success) return { error: "Invalid review action." };
  const role = await getDemoRole();
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, status: true } });
  if (!task) return { error: "Task not found." };
  const transition = reviewTransition(task.status, parsedAction.data, role, comment);
  if (!transition.ok) return { error: transition.error };

  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: { status: transition.nextStatus } }),
      prisma.auditEvent.create({ data: { projectId: task.projectId, taskId, action: `TASK_${parsedAction.data}`, metadata: { from: task.status, to: transition.nextStatus, role } } }),
      ...(transition.comment
        ? [prisma.reviewComment.create({ data: { taskId, author: roleLabel(role), body: transition.comment } })]
        : []),
    ]);
  } catch {
    return { error: "Could not update the task status. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath("/dashboard/review");
  return {};
}

export async function addReviewComment(taskId: string, comment: string): Promise<ActionResult> {
  const role = await getDemoRole();
  if (!can(role, "COMMENT")) return { error: "Your demo role cannot add review comments." };
  const parsed = reviewCommentSchema.safeParse(comment);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true } });
  if (!task) return { error: "Task not found." };

  try {
    await prisma.reviewComment.create({ data: { taskId, author: roleLabel(role), body: parsed.data } });
  } catch {
    return { error: "Could not save the comment. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${taskId}`);
  return {};
}

function roleLabel(role: Role) {
  return `${role[0]}${role.slice(1).toLowerCase()} (demo)`;
}
