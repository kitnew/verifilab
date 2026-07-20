import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/demo-role";
import { can } from "@/lib/review";
import { MAX_TASK_IMPORT_BYTES, taskImportFormat } from "@/lib/task-import";
import { confirmProjectTaskImport, previewProjectTaskImport, TaskImportError } from "@/lib/task-import-service";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TASK_IMPORT_BYTES + 100_000) return Response.json({ error: "File is too large." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    const projectId = form.get("projectId");
    const mode = form.get("mode");
    if (!(file instanceof File)) return Response.json({ error: "Choose a file." }, { status: 400 });
    if (typeof projectId !== "string" || !projectId) return Response.json({ error: "Choose a project." }, { status: 400 });
    if (file.size > MAX_TASK_IMPORT_BYTES) return Response.json({ error: `File exceeds ${MAX_TASK_IMPORT_BYTES} bytes.` }, { status: 413 });
    const format = taskImportFormat(file.name);
    if (!format) return Response.json({ error: "Use a .csv, .json, or .jsonl file." }, { status: 400 });
    const content = await file.text();

    if (mode === "preview") {
      const preview = await previewProjectTaskImport(projectId, content, format);
      return Response.json(preview, { status: preview.error ? 400 : 200 });
    }
    if (mode !== "confirm") return Response.json({ error: "Invalid import mode." }, { status: 400 });
    if (!can(await getDemoRole(), "CREATE_TASK")) return Response.json({ error: "Your demo role cannot create tasks." }, { status: 403 });
    const strategy = form.get("duplicateStrategy");
    if (strategy !== "SKIP" && strategy !== "IMPORT") return Response.json({ error: "Choose a duplicate strategy." }, { status: 400 });
    const result = await confirmProjectTaskImport({ projectId, filename: file.name, content, format, duplicateStrategy: strategy });
    revalidatePath("/dashboard/imports");
    revalidatePath("/dashboard/tasks");
    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath("/dashboard/activity");
    return Response.json(result);
  } catch (error) {
    if (error instanceof TaskImportError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Could not process the task import." }, { status: 500 });
  }
}
