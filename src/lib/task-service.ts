import { prisma } from "@/lib/prisma";
import { taskSchema, toTaskData } from "@/lib/validation";

export async function createTaskRecord(projectId: string, input: unknown, assignedAuthorId?: string) {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: "Please fix the highlighted fields.", kind: "validation" as const, fieldErrors: parsed.error.flatten().fieldErrors };
  if (!await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) return { error: "Project not found.", kind: "not_found" as const };
  try {
    const data = toTaskData(parsed.data);
    const task = await prisma.task.create({ data: {
      projectId, ...data,
      ...(assignedAuthorId ? { assignedAuthorId, authorAssignedAt: new Date() } : {}),
      verifierVersions: { create: { version: 1, verifierType: data.verifierType, verifierConfig: data.verifierConfig, changeSummary: "Initial version" } },
      auditEvents: { create: [
        { projectId, action: "TASK_CREATED", metadata: {} },
        { projectId, action: "VERIFIER_VERSION_CREATED", metadata: { version: 1 } },
      ] },
    } });
    return { task };
  } catch {
    return { error: "Could not create the task. Please try again.", kind: "internal" as const };
  }
}
