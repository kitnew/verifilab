import { MAX_EVALUATION_FILE_BYTES } from "@/lib/evaluation";
import { parseCsvImport, parseJsonlImport } from "@/lib/evaluation-import";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const format = form.get("format");
    if (!(file instanceof File)) return Response.json({ error: "Choose a file." }, { status: 400 });
    if (file.size > MAX_EVALUATION_FILE_BYTES) return Response.json({ error: `File exceeds ${MAX_EVALUATION_FILE_BYTES} bytes.` }, { status: 413 });
    if (format !== "JSONL" && format !== "CSV") return Response.json({ error: "Format must be JSONL or CSV." }, { status: 400 });
    const content = await file.text();
    const preview = format === "JSONL" ? parseJsonlImport(content) : parseCsvImport(content);
    return Response.json(preview, { status: preview.error ? 400 : 200 });
  } catch {
    return Response.json({ error: "Could not read the import file." }, { status: 400 });
  }
}
