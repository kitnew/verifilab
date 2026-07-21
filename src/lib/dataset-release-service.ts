import type { Prisma } from "@prisma/client";
import { datasetExportItems } from "@/lib/dataset";
import { createDatasetReleaseItems, releaseSplitCounts, releaseVersionIsUnique, type DatasetReleaseInput } from "@/lib/dataset-release";
import { prisma } from "@/lib/prisma";

export class DatasetReleaseError extends Error { name = "DatasetReleaseError"; }

export async function buildDatasetRelease(datasetId: string, input: DatasetReleaseInput, actorId: string) {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, include: {
    items: { orderBy: { position: "asc" }, include: { task: { include: { project: { select: { id: true, name: true, description: true } } } } } },
    releases: { where: { version: input.version }, select: { version: true } },
  } });
  if (!dataset) throw new DatasetReleaseError("Dataset not found.");
  if (!dataset.items.length) throw new DatasetReleaseError("An empty dataset cannot produce a release.");
  if (dataset.items.some((item) => item.task.status !== "APPROVED")) throw new DatasetReleaseError("Only approved tasks may be included in a dataset release.");
  if (!releaseVersionIsUnique(dataset.releases.map((release) => release.version), input.version)) throw new DatasetReleaseError(`Release ${input.version} already exists in this dataset.`);
  const released = createDatasetReleaseItems(datasetExportItems(dataset.items), input, input.seed);
  const counts = releaseSplitCounts(released.length, input);
  return prisma.$transaction(async (tx) => {
    const release = await tx.datasetRelease.create({ data: { datasetId, ...input, totalCount: released.length, trainCount: counts.train, validationCount: counts.validation, testCount: counts.test, items: released as Prisma.InputJsonArray } });
    await tx.auditEvent.create({ data: { projectId: dataset.projectId, action: "DATASET_RELEASE_CREATED", metadata: { datasetId, releaseId: release.id, version: release.version, taskCount: release.totalCount } } });
    await Promise.all(dataset.items.map((item) => tx.auditEvent.create({ data: { projectId: dataset.projectId, taskId: item.task.id, action: "TASK_ADDED_TO_RELEASE", metadata: { datasetId, releaseId: release.id, version: release.version, actorId } } })));
    return release;
  });
}
