import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { datasetReleaseContentDisposition, datasetReleaseItemSchema, releaseSplits, serializeDatasetRelease, type ReleaseExportScope } from "@/lib/dataset-release";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: "Authentication required." }, { status: 401 });
  const split = new URL(request.url).searchParams.get("split") ?? "all";
  if (split !== "all" && !releaseSplits.includes(split as typeof releaseSplits[number])) return new Response("Split must be all, train, validation, or test.", { status: 400 });
  const { releaseId } = await params;
  const release = await prisma.datasetRelease.findUnique({ where: { id: releaseId }, include: { dataset: { select: { id: true, name: true, projectId: true } } } });
  if (!release) return new Response("Dataset release not found.", { status: 404 });
  const items = datasetReleaseItemSchema.array().safeParse(release.items);
  if (!items.success) return new Response("Stored release snapshot is invalid.", { status: 500 });
  const scope = split as ReleaseExportScope;
  const content = serializeDatasetRelease(items.data, scope);
  await prisma.auditEvent.create({ data: { projectId: release.dataset.projectId, action: "DATASET_RELEASE_EXPORTED", metadata: { datasetId: release.dataset.id, releaseId: release.id, version: release.version, split: scope } } });
  revalidatePath("/dashboard/activity");
  return new Response(content, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": datasetReleaseContentDisposition(release.dataset.name, release.version, scope) } });
}
