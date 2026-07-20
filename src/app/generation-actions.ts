"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDemoRole } from "@/lib/demo-role";
import { generateTasks, generationFingerprint, generationRequestSchema, selectedGenerationSchema, type GeneratedTask, type GenerationRequest } from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";

export type PreviewTask = GeneratedTask & { duplicate: boolean };
export type GenerationActionResult = { error?: string; jobId?: string; tasks?: PreviewTask[]; created?: number; duplicates?: string[] };

export async function previewGeneration(input: unknown): Promise<GenerationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot generate tasks." };
  const parsed = generationRequestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  let job: { id: string };
  try {
    job = await prisma.generationJob.create({ data: { projectId: parsed.data.projectId, requestedCount: parsed.data.count, seed: parsed.data.seed, generatorType: parsed.data.generatorType, generatorVersion: 1, difficulty: parsed.data.difficulty } });
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: "RUNNING", progress: 1 } });
  } catch {
    return { error: "Could not start generation." };
  }

  try {
    const tasks = generateTasks(parsed.data, job.id);
    const fingerprints = tasks.map(generationFingerprint);
    const duplicates = new Set((await prisma.task.findMany({ where: { projectId: parsed.data.projectId, generationFingerprint: { in: fingerprints } }, select: { generationFingerprint: true } })).map((task) => task.generationFingerprint));
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", generatedCount: tasks.length, progress: 100, completedAt: new Date() } });
    revalidatePath("/dashboard/generation/history");
    return { jobId: job.id, tasks: tasks.map((task) => ({ ...task, duplicate: duplicates.has(generationFingerprint(task)) })) };
  } catch (error) {
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: message(error), completedAt: new Date() } }).catch(() => undefined);
    revalidatePath("/dashboard/generation/history");
    return { error: "Generation failed. Retry from generation history." };
  }
}

export async function persistGeneratedTasks(input: unknown): Promise<GenerationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot create tasks." };
  const parsed = selectedGenerationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const job = await prisma.generationJob.findUnique({ where: { id: parsed.data.jobId } });
  if (!job) return { error: "Generation job not found." };
  if (job.status !== "COMPLETED") return { error: "Only completed previews can be saved." };

  const request: GenerationRequest = { projectId: job.projectId, generatorType: job.generatorType, count: job.requestedCount, difficulty: job.difficulty, seed: job.seed };
  const generated = generateTasks(request, job.id);
  const selected = parsed.data.indices.map((index) => generated[index]).filter((task): task is GeneratedTask => task !== undefined);
  if (selected.length !== parsed.data.indices.length) return { error: "The selected preview is invalid." };
  const fingerprints = selected.map(generationFingerprint);
  const existing = new Set((await prisma.task.findMany({ where: { projectId: job.projectId, generationFingerprint: { in: fingerprints } }, select: { generationFingerprint: true } })).map((task) => task.generationFingerprint));
  const fresh = selected.filter((task) => !existing.has(generationFingerprint(task)));
  const duplicates = selected.filter((task) => existing.has(generationFingerprint(task))).map((task) => task.title);

  try {
    await prisma.$transaction(fresh.map((task) => prisma.task.create({ data: {
      projectId: job.projectId,
      title: task.title,
      prompt: task.prompt,
      verifierType: task.verifierType,
      verifierConfig: task.verifierConfig as Prisma.InputJsonValue,
      verifierVersions: { create: { version: 1, verifierType: task.verifierType, verifierConfig: task.verifierConfig as Prisma.InputJsonValue, changeSummary: "Initial version" } },
      expectedAnswer: task.expectedAnswer,
      difficulty: task.difficulty,
      status: "DRAFT",
      tags: task.tags,
      generatorTemplate: task.generatorTemplate,
      generatorVersion: task.generatorVersion,
      generationSeed: task.seed,
      generationBatchId: job.id,
      generationFingerprint: generationFingerprint(task),
      auditEvents: { create: [
        { projectId: job.projectId, action: "TASK_CREATED", metadata: { generationBatchId: job.id, generatorTemplate: job.generatorType } },
        { projectId: job.projectId, action: "VERIFIER_VERSION_CREATED", metadata: { version: 1 } },
      ] },
    } })));
  } catch {
    return { error: "Could not save generated tasks. Duplicate checks were repeated; please try again." };
  }

  revalidatePath(`/dashboard/projects/${job.projectId}`);
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/generation/history");
  revalidatePath("/dashboard/activity");
  return { created: fresh.length, duplicates };
}

export async function cancelGenerationJob(jobId: string): Promise<GenerationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot cancel generation." };
  const job = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { id: true, status: true, _count: { select: { tasks: true } } } });
  if (!job) return { error: "Generation job not found." };
  if (job._count.tasks > 0) return { error: "A job with saved tasks cannot be cancelled." };
  if (job.status === "FAILED" || job.status === "CANCELLED") return { error: `Job is already ${job.status.toLowerCase()}.` };
  await prisma.generationJob.update({ where: { id: jobId }, data: { status: "CANCELLED", completedAt: new Date() } });
  revalidatePath("/dashboard/generation/history");
  return {};
}

export async function retryGenerationJob(jobId: string): Promise<GenerationActionResult> {
  if (!can(await getDemoRole(), "CREATE_TASK")) return { error: "Your demo role cannot retry generation." };
  const job = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { projectId: true, generatorType: true, requestedCount: true, difficulty: true, seed: true, status: true } });
  if (!job) return { error: "Generation job not found." };
  if (job.status !== "FAILED" && job.status !== "CANCELLED") return { error: "Only failed or cancelled jobs can be retried." };
  return previewGeneration({ projectId: job.projectId, generatorType: job.generatorType, count: job.requestedCount, difficulty: job.difficulty, seed: job.seed });
}

function message(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown generation error.";
}
