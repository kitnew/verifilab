import { revalidatePath } from "next/cache";
import { getCurrentUser, getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";
import { rollbackProjectTaskImport, TaskImportError } from "@/lib/task-import-service";

export async function POST(_: Request, { params }: { params: Promise<{ importId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { importId } = await params;
    const record = await prisma.taskImport.findUnique({ where: { id: importId }, select: { projectId: true } });
    if (!record) return Response.json({ error: "Import not found." }, { status: 404 });
    const actor = await getProjectActor(record.projectId);
    if (!actor || !can(actor.role, "DELETE_TASK")) return Response.json({ error: "Your account cannot roll back imports." }, { status: 403 });
    const result = await rollbackProjectTaskImport(importId);
    revalidatePath("/dashboard/imports");
    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/activity");
    revalidatePath("/dashboard/imports/" + importId);
    return Response.json(result);
  } catch (error) {
    if (error instanceof TaskImportError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Could not roll back the import." }, { status: 500 });
  }
}
