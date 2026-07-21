import { revalidatePath } from "next/cache";
import { getCurrentUser, getProjectActor } from "@/lib/auth";
import { evaluationContentDisposition, serializeEvaluation, type EvaluationExportFormat } from "@/lib/evaluation-export";
import { evaluationResultStatuses } from "@/lib/evaluation";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { batchId } = await params;
  const search = new URL(request.url).searchParams;
  const format = search.get("format");
  const status = search.get("status");
  if (format !== "jsonl" && format !== "csv") return new Response("Format must be jsonl or csv.", { status: 400 });
  if (status && !evaluationResultStatuses.includes(status as typeof evaluationResultStatuses[number])) return new Response("Invalid result status filter.", { status: 400 });
  try {
    const batch = await prisma.evaluationBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true, name: true, taskId: true, taskPromptSnapshot: true, verifierTypeSnapshot: true, verifierConfigSnapshot: true, createdAt: true,
        task: { select: { projectId: true } },
        results: { where: status ? { status: status as typeof evaluationResultStatuses[number] } : {}, orderBy: { sequenceNumber: "asc" }, select: { sequenceNumber: true, candidateResponse: true, passed: true, reward: true, status: true, modelName: true, modelVersion: true, temperature: true, seed: true, externalId: true, details: true, normalizedCandidate: true, executionTimeMs: true, metadata: true } },
      },
    });
    if (!batch) return new Response("Evaluation batch not found.", { status: 404 });
    if (!await getProjectActor(batch.task.projectId)) return new Response("Evaluation batch not found.", { status: 404 });
    const content = serializeEvaluation(batch, format as EvaluationExportFormat);
    await prisma.auditEvent.create({ data: { projectId: batch.task.projectId, taskId: batch.taskId, action: "EVALUATION_EXPORTED", metadata: { evaluationBatchId: batch.id, format, status: status || "ALL", resultCount: batch.results.length } } });
    revalidatePath("/dashboard/activity");
    const bytes = new TextEncoder().encode(content);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (let offset = 0; offset < bytes.length; offset += 64 * 1024) controller.enqueue(bytes.slice(offset, offset + 64 * 1024)); controller.close(); } });
    return new Response(stream, { headers: { "Content-Type": format === "jsonl" ? "application/x-ndjson; charset=utf-8" : "text/csv; charset=utf-8", "Content-Disposition": evaluationContentDisposition(batch.name, batch.createdAt, format as EvaluationExportFormat) } });
  } catch {
    return new Response("Evaluation export failed.", { status: 500 });
  }
}
