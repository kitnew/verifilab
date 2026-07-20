import { datasetContentDisposition, serializeDataset, type ExportFormat } from "@/lib/dataset";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ datasetId: string }> }) {
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "json" && format !== "jsonl") return new Response("Format must be json or jsonl.", { status: 400 });
  const { datasetId } = await params;
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: { items: { orderBy: { position: "asc" }, include: { task: { include: { project: { select: { id: true, name: true, description: true } } } } } } },
  });
  if (!dataset) return new Response("Dataset not found.", { status: 404 });

  return new Response(serializeDataset(dataset.items, format as ExportFormat), {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "application/x-ndjson; charset=utf-8",
      "Content-Disposition": datasetContentDisposition(dataset.name, format as ExportFormat),
    },
  });
}
