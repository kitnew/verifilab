"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { COOKIE_NAME, getDemoRole } from "@/lib/demo-role";
import { isDatasetEligible } from "@/lib/dataset";
import { prisma } from "@/lib/prisma";
import { can, reviewTransition, roles, type ReviewAction, type Role } from "@/lib/review";
import { candidateSchema, projectSchema, reviewCommentSchema, storedVerifierSchema, taskSchema, toTaskData, type ProjectInput, type TaskInput } from "@/lib/validation";
import { verify, type VerificationResult } from "@/lib/verifier";

export type ActionResult = { error?: string; fieldErrors?: Record<string, string[]> };
export type BulkTaskOperation = "SUBMIT" | "ADD_TAGS" | "DELETE_DRAFTS" | "ADD_TO_DATASET";
export type BulkTaskResult = {
  succeeded: { taskId: string; title: string }[];
  failures: { taskId: string; title: string; error: string }[];
  error?: string;
};

const bulkTaskIds = z.array(z.string().min(1)).min(1, "Select at least one task.").max(100).transform((ids) => [...new Set(ids)]);
const bulkTaskSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("SUBMIT"), taskIds: bulkTaskIds }),
  z.object({ operation: z.literal("DELETE_DRAFTS"), taskIds: bulkTaskIds }),
  z.object({ operation: z.literal("ADD_TAGS"), taskIds: bulkTaskIds, tags: z.string().max(300).transform(splitTags).refine((tags) => tags.length > 0, "Enter at least one tag.") }),
  z.object({ operation: z.literal("ADD_TO_DATASET"), taskIds: bulkTaskIds, datasetId: z.string().min(1, "Choose a dataset.") }),
]);

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
  revalidatePath("/dashboard/activity");
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
  revalidatePath("/dashboard/activity");
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
  revalidatePath("/dashboard/activity");
  redirect(`/dashboard/projects/${projectId}/tasks/${taskId}`);
}

export async function duplicateTask(taskId: string): Promise<ActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot duplicate tasks." };
  const source = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, title: true, prompt: true, verifierType: true, verifierConfig: true, difficulty: true, tags: true },
  });
  if (!source) return { error: "Task not found." };

  let duplicate;
  try {
    duplicate = await prisma.task.create({
      data: {
        projectId: source.projectId,
        title: `Copy of ${source.title}`,
        prompt: source.prompt,
        verifierType: source.verifierType,
        verifierConfig: source.verifierConfig as Prisma.InputJsonValue,
        difficulty: source.difficulty,
        status: "DRAFT",
        tags: source.tags as Prisma.InputJsonValue,
        auditEvents: { create: { projectId: source.projectId, action: "TASK_DUPLICATED", metadata: { sourceTaskId: taskId } } },
      },
    });
  } catch {
    return { error: "Could not duplicate the task. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${source.projectId}`);
  revalidatePath("/dashboard/activity");
  redirect(`/dashboard/projects/${source.projectId}/tasks/${duplicate.id}`);
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

export async function bulkTaskAction(input: unknown): Promise<BulkTaskResult> {
  const parsed = bulkTaskSchema.safeParse(input);
  if (!parsed.success) return { succeeded: [], failures: [], error: parsed.error.issues[0].message };

  const { operation, taskIds } = parsed.data;
  const role = await getDemoRole();
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, projectId: true, title: true, status: true, tags: true },
  });
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const result: BulkTaskResult = { succeeded: [], failures: [] };
  const dataset = operation === "ADD_TO_DATASET"
    ? await prisma.dataset.findUnique({ where: { id: parsed.data.datasetId }, select: { id: true, name: true, projectId: true, items: { select: { taskId: true, position: true } } } })
    : null;
  if (operation === "ADD_TO_DATASET" && !dataset) return { ...result, error: "Dataset not found." };
  const datasetTaskIds = new Set(dataset?.items.map((item) => item.taskId));
  let nextPosition = Math.max(0, ...dataset?.items.map((item) => item.position) ?? []) + 1;

  // ponytail: sequential writes keep per-task failures deterministic; batch only if the 100-task cap becomes slow.
  for (const taskId of taskIds) {
    const task = tasksById.get(taskId);
    if (!task) {
      result.failures.push({ taskId, title: taskId, error: "Task not found." });
      continue;
    }

    let error: string | undefined;
    try {
      if (operation === "SUBMIT") {
        const transition = reviewTransition(task.status, "SUBMIT", role);
        if (!transition.ok) error = transition.error;
        else await prisma.$transaction([
          prisma.task.update({ where: { id: task.id }, data: { status: transition.nextStatus } }),
          prisma.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "TASK_SUBMIT", metadata: { from: task.status, to: transition.nextStatus, role } } }),
        ]);
      } else if (operation === "ADD_TAGS") {
        if (!can(role, "EDIT_TASK")) error = `${role} does not have permission to add tags to this task.`;
        else {
          const tags = [...new Set([...jsonTags(task.tags), ...parsed.data.tags])];
          if (tags.join(", ").length > 300) error = "Combined tags cannot exceed 300 characters.";
          else await prisma.$transaction([
            prisma.task.update({ where: { id: task.id }, data: { tags } }),
            prisma.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "TASK_TAGS_ADDED", metadata: { tags: parsed.data.tags, role } } }),
          ]);
        }
      } else if (operation === "DELETE_DRAFTS") {
        if (!can(role, "DELETE_TASK")) error = `${role} does not have permission to delete this task.`;
        else if (task.status !== "DRAFT") error = "Only draft tasks can be bulk deleted.";
        else await prisma.task.delete({ where: { id: task.id } });
      } else if (!isDatasetEligible(task, dataset!.projectId)) {
        error = "Only approved tasks from this dataset's project can be added.";
      } else if (datasetTaskIds.has(task.id)) {
        error = "Task is already in this dataset.";
      } else {
        await prisma.$transaction([
          prisma.datasetItem.create({ data: { datasetId: dataset!.id, taskId: task.id, position: nextPosition } }),
          prisma.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "TASK_ADDED_TO_DATASET", metadata: { datasetId: dataset!.id, datasetName: dataset!.name } } }),
        ]);
        datasetTaskIds.add(task.id);
        nextPosition += 1;
      }
    } catch {
      error = "Database operation failed. Please try again.";
    }

    if (error) result.failures.push({ taskId: task.id, title: task.title, error });
    else result.succeeded.push({ taskId: task.id, title: task.title });
  }

  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/review");
  for (const projectId of new Set(tasks.map((task) => task.projectId))) revalidatePath(`/dashboard/projects/${projectId}`);
  if (dataset) revalidatePath(`/dashboard/datasets/${dataset.id}`);
  revalidatePath("/dashboard/activity");
  return result;
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
    ...(result.validationErrors === undefined ? {} : { validationErrors: result.validationErrors as Prisma.InputJsonValue }),
  };

  try {
    await prisma.$transaction([
      prisma.verificationRun.create({ data: { taskId, candidate: parsedCandidate.data, passed: result.passed, details } }),
      prisma.auditEvent.create({ data: { projectId: task.projectId, taskId, action: "VERIFICATION_EXECUTED", metadata: { passed: result.passed, reward: result.reward, executionTimeMs: result.executionTimeMs } } }),
    ]);
  } catch {
    return { error: "Verification ran, but the result could not be saved." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${task.id}`);
  revalidatePath(`/dashboard/projects/${task.projectId}`);
  revalidatePath("/dashboard/activity");
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
  revalidatePath(`/dashboard/projects/${task.projectId}`);
  revalidatePath("/dashboard/activity");
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

function splitTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function jsonTags(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}
