"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { datasetExportItems, datasetSchema, datasetTaskIdsSchema, datasetUpdateSchema, isDatasetEligible, type DatasetInput } from "@/lib/dataset";
import { prisma } from "@/lib/prisma";

export type DatasetActionResult = { error?: string };

export async function createDataset(input: DatasetInput): Promise<DatasetActionResult> {
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  let dataset;
  try {
    dataset = await prisma.dataset.create({ data: parsed.data });
  } catch {
    return { error: "Could not create the dataset. Please try again." };
  }
  revalidatePath("/dashboard/datasets");
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
    await prisma.$transaction(parsedIds.data.map((id, index) => prisma.datasetItem.create({ data: { datasetId, taskId: byId.get(id)!.id, position: firstPosition + index } })));
  } catch {
    return { error: "Could not add the selected tasks. Please try again." };
  }
  revalidatePath(`/dashboard/datasets/${datasetId}`);
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
