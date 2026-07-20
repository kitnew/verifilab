import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/demo-role";
import { can } from "@/lib/review";
import { rollbackProjectTaskImport, TaskImportError } from "@/lib/task-import-service";

export async function POST(_: Request, { params }: { params: Promise<{ importId: string }> }) {
  if (!can(await getDemoRole(), "DELETE_TASK")) return Response.json({ error: "Your demo role cannot roll back imports." }, { status: 403 });
  try {
    const { importId } = await params;
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
