"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, getProjectActor } from "@/lib/auth";
import { isDatasetEligible } from "@/lib/dataset";
import { prisma } from "@/lib/prisma";
import { can, canEditAssignedTask, canReviewAssignedTask, reviewTransition, type ReviewAction } from "@/lib/review";
import { candidateSchema, projectSchema, reviewCommentSchema, storedVerifierSchema, taskSchema, toTaskData, type ProjectInput, type TaskInput } from "@/lib/validation";
import { verify, type VerificationResult } from "@/lib/verifier";
import { normalizeVerifierSnapshot, verifierChanged } from "@/lib/verifier-version";

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
  const user = await getCurrentUser();
  if (!user) return { error: "Authentication required." };
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const guestMembers = user.guestWorkspaceId ? await prisma.user.findMany({ where: { guestWorkspaceId: user.guestWorkspaceId }, select: { id: true, memberships: { select: { role: true }, take: 1 } } }) : [];

  let project;
  try {
    project = await prisma.project.create({
      data: {
        ...parsed.data,
        guestWorkspaceId: user.guestWorkspaceId,
        ...(guestMembers.length ? { memberships: { create: guestMembers.map((member) => ({ userId: member.id, role: member.memberships[0].role })) } } : {}),
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
  const actor = await getProjectActor(projectId);
  if (!actor || !can(actor.role, "CREATE_TASK")) return { error: "You cannot create tasks in this project." };
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  let task;
  try {
    const data = toTaskData(parsed.data);
    task = await prisma.task.create({
      data: {
        projectId,
        ...data,
        ...(actor.role === "AUTHOR" ? { assignedAuthorId: actor.id, authorAssignedAt: new Date() } : {}),
        verifierVersions: { create: { version: 1, verifierType: data.verifierType, verifierConfig: data.verifierConfig, changeSummary: "Initial version" } },
        auditEvents: { create: [
          { projectId, action: "TASK_CREATED", metadata: {} },
          { projectId, action: "VERIFIER_VERSION_CREATED", metadata: { version: 1 } },
        ] },
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
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, assignedAuthorId: true, verifierVersions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!task) return { error: "Task not found." };
  const actor = await getProjectActor(projectId);
  if (!actor || !canEditAssignedTask(actor.role, actor.id, task.assignedAuthorId)) return { error: "Only the assigned author, curator or administrator can edit this task." };
  const active = task.verifierVersions[0];
  if (!active) return { error: "Task has no verifier version." };
  const data = toTaskData(parsed.data);
  const next = normalizeVerifierSnapshot({ verifierType: data.verifierType, verifierConfig: data.verifierConfig });
  let changed = true;
  try {
    changed = verifierChanged(active, next);
  } catch {
    // A valid edit must be able to replace an invalid legacy snapshot.
  }

  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: {
        ...data,
        ...(changed ? { verifierVersions: { create: { version: active.version + 1, verifierType: next.verifierType, verifierConfig: next.verifierConfig as Prisma.InputJsonValue, changeSummary: parsed.data.changeSummary || null } } } : {}),
      } }),
      prisma.auditEvent.create({ data: { projectId, taskId, action: "TASK_UPDATED", metadata: {} } }),
      ...(changed ? [prisma.auditEvent.create({ data: { projectId, taskId, action: "VERIFIER_VERSION_CREATED", metadata: { version: active.version + 1, previousVersion: active.version } } })] : []),
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
  const source = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, title: true, prompt: true, verifierType: true, verifierConfig: true, difficulty: true, tags: true },
  });
  if (!source) return { error: "Task not found." };
  const actor = await getProjectActor(source.projectId);
  if (!actor || !can(actor.role, "CREATE_TASK")) return { error: "You cannot duplicate tasks in this project." };
  let snapshot;
  try {
    snapshot = normalizeVerifierSnapshot(source);
  } catch {
    return { error: "This task has an invalid verifier configuration." };
  }

  let duplicate;
  try {
    duplicate = await prisma.task.create({
      data: {
        projectId: source.projectId,
        title: `Copy of ${source.title}`,
        prompt: source.prompt,
        verifierType: snapshot.verifierType,
        verifierConfig: snapshot.verifierConfig as Prisma.InputJsonValue,
        verifierVersions: { create: { version: 1, verifierType: snapshot.verifierType, verifierConfig: snapshot.verifierConfig as Prisma.InputJsonValue, changeSummary: "Initial version" } },
        difficulty: source.difficulty,
        status: "DRAFT",
        tags: source.tags as Prisma.InputJsonValue,
        ...(actor.role === "AUTHOR" ? { assignedAuthorId: actor.id, authorAssignedAt: new Date() } : {}),
        auditEvents: { create: [
          { projectId: source.projectId, action: "TASK_DUPLICATED", metadata: { sourceTaskId: taskId } },
          { projectId: source.projectId, action: "VERIFIER_VERSION_CREATED", metadata: { version: 1 } },
        ] },
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
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true, assignedAuthorId: true } });
  if (!task) return { error: "Task not found." };
  const actor = await getProjectActor(projectId);
  if (!actor || !can(actor.role, "DELETE_TASK") || !canEditAssignedTask(actor.role, actor.id, task.assignedAuthorId)) return { error: "You cannot delete this task." };

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
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, projectId: true, title: true, status: true, tags: true, assignedAuthorId: true },
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
    const actor = await getProjectActor(task.projectId);
    if (!actor) {
      result.failures.push({ taskId: task.id, title: task.title, error: "You are not a member of this project." });
      continue;
    }
    const role = actor.role;

    let error: string | undefined;
    try {
      if (operation === "SUBMIT") {
        if (!canEditAssignedTask(role, actor.id, task.assignedAuthorId)) error = "Only the assigned author, curator or administrator may submit this task.";
        const transition = error ? null : reviewTransition(task.status, "SUBMIT", role);
        if (transition && !transition.ok) error = transition.error;
        else if (transition) await prisma.$transaction([
          prisma.task.update({ where: { id: task.id }, data: { status: transition.nextStatus, submittedAt: new Date() } }),
          prisma.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "TASK_SUBMITTED_FOR_REVIEW", metadata: { from: task.status, to: transition.nextStatus, role, actorId: actor.id } } }),
        ]);
      } else if (operation === "ADD_TAGS") {
        if (!can(role, "EDIT_TASK") || !canEditAssignedTask(role, actor.id, task.assignedAuthorId)) error = `${role} does not have permission to add tags to this task.`;
        else {
          const tags = [...new Set([...jsonTags(task.tags), ...parsed.data.tags])];
          if (tags.join(", ").length > 300) error = "Combined tags cannot exceed 300 characters.";
          else await prisma.$transaction([
            prisma.task.update({ where: { id: task.id }, data: { tags } }),
            prisma.auditEvent.create({ data: { projectId: task.projectId, taskId: task.id, action: "TASK_TAGS_ADDED", metadata: { tags: parsed.data.tags, role } } }),
          ]);
        }
      } else if (operation === "DELETE_DRAFTS") {
        if (!can(role, "DELETE_TASK") || !canEditAssignedTask(role, actor.id, task.assignedAuthorId)) error = `${role} does not have permission to delete this task.`;
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
    select: { id: true, projectId: true, verifierVersions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!task) return { error: "Task not found." };
  if (!await getProjectActor(task.projectId)) return { error: "You cannot run verification for this project." };
  const active = task.verifierVersions[0];
  if (!active) return { error: "Task has no verifier version." };

  const parsedVerifier = storedVerifierSchema.safeParse({ type: active.verifierType, config: active.verifierConfig });
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
      prisma.verificationRun.create({ data: { taskId, verifierVersionId: active.id, candidate: parsedCandidate.data, passed: result.passed, details } }),
      prisma.auditEvent.create({ data: { projectId: task.projectId, taskId, action: "VERIFICATION_EXECUTED", metadata: { passed: result.passed, reward: result.reward, executionTimeMs: result.executionTimeMs, verifierVersion: active.version } } }),
    ]);
  } catch {
    return { error: "Verification ran, but the result could not be saved." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${task.id}`);
  revalidatePath(`/dashboard/projects/${task.projectId}`);
  revalidatePath("/dashboard/activity");
  return { result };
}

export async function restoreVerifierVersion(taskId: string, projectId: string, verifierVersionId: string): Promise<ActionResult> {
  const [source, active] = await Promise.all([
    prisma.verifierVersion.findFirst({ where: { id: verifierVersionId, taskId, task: { projectId } }, include: { task: { select: { assignedAuthorId: true } } } }),
    prisma.verifierVersion.findFirst({ where: { taskId, task: { projectId } }, orderBy: { version: "desc" } }),
  ]);
  if (!source || !active) return { error: "Verifier version not found." };
  const actor = await getProjectActor(projectId);
  if (!actor || !canEditAssignedTask(actor.role, actor.id, source.task?.assignedAuthorId ?? null)) return { error: "You cannot restore verifier versions for this task." };
  if (source.version >= active.version) return { error: "Only a historical verifier version can be restored." };

  let snapshot;
  try {
    snapshot = normalizeVerifierSnapshot(source);
  } catch {
    return { error: "This verifier version has an invalid configuration." };
  }
  const version = active.version + 1;
  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: { verifierType: snapshot.verifierType, verifierConfig: snapshot.verifierConfig as Prisma.InputJsonValue } }),
      prisma.verifierVersion.create({ data: { taskId, version, verifierType: snapshot.verifierType, verifierConfig: snapshot.verifierConfig as Prisma.InputJsonValue, changeSummary: `Restored from version ${source.version}` } }),
      prisma.auditEvent.create({ data: { projectId, taskId, action: "VERIFIER_VERSION_RESTORED", metadata: { version, sourceVersion: source.version } } }),
    ]);
  } catch {
    return { error: "Could not restore the verifier version. Refresh and try again." };
  }

  revalidatePath(`/dashboard/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/dashboard/projects/${projectId}/tasks/${taskId}/edit`);
  revalidatePath("/dashboard/activity");
  return {};
}

export async function changeTaskStatus(taskId: string, action: ReviewAction, comment = ""): Promise<ActionResult> {
  const parsedAction = z.enum(["START", "SUBMIT", "REQUEST_CHANGES", "APPROVE", "REJECT"]).safeParse(action);
  if (!parsedAction.success) return { error: "Invalid review action." };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, status: true, assignedAuthorId: true, assignedReviewerId: true } });
  if (!task) return { error: "Task not found." };
  const actor = await getProjectActor(task.projectId);
  if (!actor) return { error: "You are not a member of this project." };
  const reviewing = ["REQUEST_CHANGES", "APPROVE", "REJECT"].includes(parsedAction.data);
  if (reviewing && !canReviewAssignedTask(actor.role, actor.id, task.assignedAuthorId, task.assignedReviewerId)) return { error: "Only the assigned reviewer, curator or administrator may review this task, and authors cannot review their own work." };
  if (!reviewing && !canEditAssignedTask(actor.role, actor.id, task.assignedAuthorId)) return { error: "Only the assigned author, curator or administrator may move this task forward." };
  const transition = reviewTransition(task.status, parsedAction.data, actor.role, comment);
  if (!transition.ok) return { error: transition.error };
  const now = new Date();
  const actionName = { START: "TASK_WORK_STARTED", SUBMIT: "TASK_SUBMITTED_FOR_REVIEW", REQUEST_CHANGES: "TASK_CHANGES_REQUESTED", APPROVE: "TASK_APPROVED", REJECT: "TASK_REJECTED" }[parsedAction.data];

  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: {
        status: transition.nextStatus,
        ...(transition.nextStatus === "IN_REVIEW" ? { submittedAt: now } : {}),
        ...(["APPROVED", "REJECTED"].includes(transition.nextStatus) ? { completedAt: now } : {}),
      } }),
      prisma.auditEvent.create({ data: { projectId: task.projectId, taskId, action: actionName, metadata: { from: task.status, to: transition.nextStatus, role: actor.role, actorId: actor.id } } }),
      ...(transition.comment
        ? [prisma.reviewComment.create({ data: { taskId, author: actor.name, body: transition.comment } })]
        : []),
    ]);
  } catch {
    return { error: "Could not update the task status. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/my-work");
  revalidatePath(`/dashboard/projects/${task.projectId}`);
  revalidatePath("/dashboard/activity");
  return {};
}

export async function addReviewComment(taskId: string, comment: string): Promise<ActionResult> {
  const parsed = reviewCommentSchema.safeParse(comment);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, status: true, assignedAuthorId: true, assignedReviewerId: true } });
  if (!task) return { error: "Task not found." };
  const actor = await getProjectActor(task.projectId);
  if (!actor || !can(actor.role, "COMMENT") || !canReviewAssignedTask(actor.role, actor.id, task.assignedAuthorId, task.assignedReviewerId)) return { error: "Only the assigned reviewer, curator or administrator may comment on this review." };

  try {
    await prisma.reviewComment.create({ data: { taskId, author: actor.name, body: parsed.data } });
  } catch {
    return { error: "Could not save the comment. Please try again." };
  }

  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${taskId}`);
  return {};
}

function splitTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function jsonTags(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}
