"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";

type Result = { error?: string };
const roleSchema = z.enum(["ADMIN", "AUTHOR", "REVIEWER", "CURATOR"]);
const assignmentSchema = z.object({
  authorId: z.string().min(1).nullable(),
  reviewerId: z.string().min(1).nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.union([z.literal(""), z.iso.date()]),
});

export async function setProjectMembership(projectId: string, userId: string, role: string): Promise<Result> {
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { error: "Invalid project role." };
  const actor = await getCurrentUser();
  if (!actor?.isAdmin) return { error: "Only an administrator can manage project memberships." };
  const [project, user, previous] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } }),
  ]);
  if (!project || !user) return { error: "Project or user not found." };
  try {
    await prisma.$transaction([
      prisma.projectMembership.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: { projectId, userId, role: parsedRole.data },
        update: { role: parsedRole.data },
      }),
      prisma.auditEvent.create({ data: { projectId, action: "PROJECT_ROLE_CHANGED", metadata: { userId, userName: user.name, from: previous?.role ?? null, to: parsedRole.data, actorId: actor.id } } }),
    ]);
  } catch {
    return { error: "Could not update the project membership." };
  }
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/activity");
  return {};
}

export async function assignTask(taskId: string, input: unknown): Promise<Result> {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, assignedAuthorId: true, assignedReviewerId: true } });
  if (!task) return { error: "Task not found." };
  const actor = await getProjectActor(task.projectId);
  if (!actor || !can(actor.role, "ASSIGN_TASK")) return { error: "Only a curator or administrator can assign tasks." };
  const memberIds = [parsed.data.authorId, parsed.data.reviewerId].filter((id): id is string => id !== null);
  const memberships = await prisma.projectMembership.findMany({ where: { projectId: task.projectId, userId: { in: memberIds } }, select: { userId: true, role: true } });
  const byUser = new Map(memberships.map((membership) => [membership.userId, membership.role]));
  if (parsed.data.authorId && !["AUTHOR", "ADMIN"].includes(byUser.get(parsed.data.authorId) ?? "")) return { error: "The assigned author must be an author in this project." };
  if (parsed.data.reviewerId && !["REVIEWER", "ADMIN"].includes(byUser.get(parsed.data.reviewerId) ?? "")) return { error: "The assigned reviewer must be a reviewer in this project." };
  if (parsed.data.authorId && parsed.data.authorId === parsed.data.reviewerId) return { error: "An author cannot review their own task." };
  const now = new Date();
  const authorChanged = task.assignedAuthorId !== parsed.data.authorId;
  const reviewerChanged = task.assignedReviewerId !== parsed.data.reviewerId;
  try {
    await prisma.$transaction([
      prisma.task.update({ where: { id: task.id }, data: {
        assignedAuthorId: parsed.data.authorId,
        assignedReviewerId: parsed.data.reviewerId,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T23:59:59.999Z`) : null,
        ...(authorChanged ? { authorAssignedAt: parsed.data.authorId ? now : null } : {}),
        ...(reviewerChanged ? { reviewerAssignedAt: parsed.data.reviewerId ? now : null } : {}),
      } }),
      ...(authorChanged ? [prisma.auditEvent.create({ data: { projectId: task.projectId, taskId, action: "TASK_AUTHOR_ASSIGNED", metadata: { from: task.assignedAuthorId, to: parsed.data.authorId, actorId: actor.id } } })] : []),
      ...(reviewerChanged ? [prisma.auditEvent.create({ data: { projectId: task.projectId, taskId, action: "TASK_REVIEWER_ASSIGNED", metadata: { from: task.assignedReviewerId, to: parsed.data.reviewerId, actorId: actor.id } } })] : []),
    ]);
  } catch {
    return { error: "Could not update the task assignment." };
  }
  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${task.id}`);
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/my-work");
  revalidatePath("/dashboard/activity");
  return {};
}
