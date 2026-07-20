"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { datasetExportItems, datasetSchema, datasetTaskIdsSchema, datasetUpdateSchema, isDatasetEligible, type DatasetInput } from "@/lib/dataset";
import { analyzeDatasetQuality } from "@/lib/dataset-quality";
import { createDatasetReleaseItems, datasetReleaseSchema, releaseSplitCounts, releaseVersionIsUnique } from "@/lib/dataset-release";
import { prisma } from "@/lib/prisma";

export type DatasetActionResult = { error?: string; releaseId?: string };

export async function createDataset(input: DatasetInput): Promise<DatasetActionResult> {
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  let dataset;
  try {
    dataset = await prisma.$transaction(async (transaction) => {
      const created = await transaction.dataset.create({ data: parsed.data });
      await transaction.auditEvent.create({ data: { projectId: created.projectId, action: "DATASET_CREATED", metadata: { datasetId: created.id, datasetName: created.name } } });
      return created;
    });
  } catch {
    return { error: "Could not create the dataset. Please try again." };
  }
  revalidatePath("/dashboard/datasets");
  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  revalidatePath("/dashboard/activity");
  redirect(`/dashboard/datasets/${dataset.id}`);
}

export async function updateDataset(datasetId: string, input: Omit<DatasetInput, "projectId">): Promise<DatasetActionResult> {
  const parsed = datasetUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { id: true } });
  if (!dataset) return { error: "Dataset not found." };

  try {
    await prisma.dataset.update({ where: { id: datasetId }, data: parsed.data });
  } catch {
    return { error: "Could not update the dataset. Please try again." };
  }
  revalidatePath("/dashboard/datasets");
  revalidatePath(`/dashboard/datasets/${datasetId}`);
  redirect(`/dashboard/datasets/${datasetId}`);
}

export async function addTasksToDataset(datasetId: string, taskIds: string[]): Promise<DatasetActionResult> {
  const parsedIds = datasetTaskIdsSchema.safeParse([...new Set(taskIds)]);
  if (!parsedIds.success) return { error: parsedIds.error.issues[0].message };
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, include: { items: { select: { taskId: true, position: true } } } });
  if (!dataset) return { error: "Dataset not found." };
  const existing = new Set(dataset.items.map((item) => item.taskId));
  if (parsedIds.data.some((id) => existing.has(id))) return { error: "One or more selected tasks are already in this dataset." };

  const tasks = await prisma.task.findMany({ where: { id: { in: parsedIds.data } }, select: { id: true, status: true, projectId: true } });
  if (tasks.length !== parsedIds.data.length) return { error: "One or more selected tasks were not found." };
  if (tasks.some((task) => !isDatasetEligible(task, dataset.projectId))) return { error: "Only approved tasks from this dataset's project can be added." };
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const firstPosition = Math.max(0, ...dataset.items.map((item) => item.position)) + 1;

  try {
    await prisma.$transaction(parsedIds.data.flatMap((id, index) => [
      prisma.datasetItem.create({ data: { datasetId, taskId: byId.get(id)!.id, position: firstPosition + index } }),
      prisma.auditEvent.create({ data: { projectId: dataset.projectId, taskId: id, action: "TASK_ADDED_TO_DATASET", metadata: { datasetId, datasetName: dataset.name } } }),
    ]));
  } catch {
    return { error: "Could not add the selected tasks. Please try again." };
  }
  revalidatePath(`/dashboard/datasets/${datasetId}`);
  revalidatePath(`/dashboard/projects/${dataset.projectId}`);
  revalidatePath("/dashboard/activity");
  return {};
}

export async function removeTaskFromDataset(datasetId: string, taskId: string): Promise<DatasetActionResult> {
  try {
    const removed = await prisma.datasetItem.deleteMany({ where: { datasetId, taskId } });
    if (!removed.count) return { error: "Dataset item not found." };
  } catch {
    return { error: "Could not remove the task. Please try again." };
  }
  revalidatePath(`/dashboard/datasets/${datasetId}`);
  return {};
}

export async function duplicateDataset(datasetId: string): Promise<DatasetActionResult> {
  const source = await prisma.dataset.findUnique({ where: { id: datasetId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!source) return { error: "Dataset not found." };

  let duplicate;
  try {
    duplicate = await prisma.dataset.create({
      data: {
        projectId: source.projectId,
        name: `${source.name} (copy)`,
        description: source.description,
        items: { create: source.items.map((item) => ({ taskId: item.taskId, position: item.position })) },
      },
    });
  } catch {
    return { error: "Could not duplicate the dataset. Please try again." };
  }
  revalidatePath("/dashboard/datasets");
  redirect(`/dashboard/datasets/${duplicate.id}`);
}

export async function snapshotDataset(datasetId: string): Promise<DatasetActionResult> {
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: {
      items: { orderBy: { position: "asc" }, include: { task: { include: { project: { select: { id: true, name: true, description: true } } } } } },
      versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } },
    },
  });
  if (!dataset) return { error: "Dataset not found." };
  const items = datasetExportItems(dataset.items) as Prisma.InputJsonArray;

  try {
    await prisma.datasetVersion.create({ data: { datasetId, version: (dataset.versions[0]?.version ?? 0) + 1, name: dataset.name, description: dataset.description, items } });
  } catch {
    return { error: "Could not create the snapshot. Please try again." };
  }
  revalidatePath(`/dashboard/datasets/${datasetId}`);
  return {};
}

export async function runDatasetQualityScan(datasetId: string): Promise<DatasetActionResult> {
  const parsedId = z.string().min(1).safeParse(datasetId);
  if (!parsedId.success) return { error: "Invalid dataset ID." };
  const dataset = await prisma.dataset.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      projectId: true,
      items: { orderBy: { position: "asc" }, select: { task: { select: {
        id: true, title: true, prompt: true, status: true, verifierType: true, verifierConfig: true, difficulty: true, tags: true, generatorTemplate: true,
        verificationRuns: { select: { passed: true } },
        evaluationBatches: { select: { results: { where: { status: { in: ["PASSED", "FAILED"] } }, select: { status: true, reward: true, executionTimeMs: true } } } },
      } } } },
    },
  });
  if (!dataset) return { error: "Dataset not found." };
  const report = analyzeDatasetQuality(dataset.items.map((item) => item.task));
  const data = {
    taskCount: report.taskCount,
    overallScore: report.overallScore,
    completenessScore: report.completenessScore,
    verifierValidityScore: report.verifierValidityScore,
    duplicateSafetyScore: report.duplicateSafetyScore,
    verificationEvidenceScore: report.verificationEvidenceScore,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    infoCount: report.infoCount,
    issues: report.issues as Prisma.InputJsonValue,
    distributions: report.distributions as Prisma.InputJsonValue,
    scannedAt: new Date(),
  };
  try {
    await prisma.$transaction([
      prisma.datasetQualityReport.upsert({ where: { datasetId: dataset.id }, create: { datasetId: dataset.id, ...data }, update: data }),
      prisma.auditEvent.create({ data: { projectId: dataset.projectId, action: "DATASET_QUALITY_SCANNED", metadata: { datasetId: dataset.id, taskCount: report.taskCount, score: report.overallScore } } }),
    ]);
  } catch {
    return { error: "Could not scan dataset quality. Please try again." };
  }
  revalidatePath(`/dashboard/datasets/${dataset.id}`);
  revalidatePath(`/dashboard/datasets/${dataset.id}/quality`);
  revalidatePath("/dashboard/activity");
  return {};
}

export async function createDatasetRelease(datasetId: string, input: unknown): Promise<DatasetActionResult> {
  const parsed = datasetReleaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { task: { include: { project: { select: { id: true, name: true, description: true } } } } },
      },
      releases: { where: { version: parsed.data.version }, select: { version: true } },
    },
  });
  if (!dataset) return { error: "Dataset not found." };
  if (!dataset.items.length) return { error: "An empty dataset cannot produce a release." };
  if (!releaseVersionIsUnique(dataset.releases.map((release) => release.version), parsed.data.version)) return { error: `Release ${parsed.data.version} already exists in this dataset.` };
  const snapshot = datasetExportItems(dataset.items);
  const released = createDatasetReleaseItems(snapshot, parsed.data, parsed.data.seed);
  const counts = releaseSplitCounts(released.length, parsed.data);
  try {
    const release = await prisma.$transaction(async (transaction) => {
      const created = await transaction.datasetRelease.create({ data: {
        datasetId: dataset.id,
        version: parsed.data.version,
        notes: parsed.data.notes,
        seed: parsed.data.seed,
        trainPercentage: parsed.data.trainPercentage,
        validationPercentage: parsed.data.validationPercentage,
        testPercentage: parsed.data.testPercentage,
        totalCount: released.length,
        trainCount: counts.train,
        validationCount: counts.validation,
        testCount: counts.test,
        items: released as Prisma.InputJsonArray,
      } });
      await transaction.auditEvent.create({ data: { projectId: dataset.projectId, action: "DATASET_RELEASE_CREATED", metadata: { datasetId: dataset.id, releaseId: created.id, version: created.version, taskCount: created.totalCount } } });
      return created;
    });
    revalidatePath(`/dashboard/datasets/${dataset.id}`);
    revalidatePath("/dashboard/activity");
    return { releaseId: release.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: `Release ${parsed.data.version} already exists in this dataset.` };
    return { error: "Could not create the dataset release. Please try again." };
  }
}
