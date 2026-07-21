import { revalidatePath } from "next/cache";
import { generateTasks, generationFingerprint, type GenerationRequest } from "@/lib/generation";
import { prisma } from "@/lib/prisma";

export async function runGenerationPreview(input: GenerationRequest) {
  const job = await prisma.generationJob.create({ data: { projectId: input.projectId, requestedCount: input.count, seed: input.seed, generatorType: input.generatorType, generatorVersion: 1, difficulty: input.difficulty } });
  await prisma.generationJob.update({ where: { id: job.id }, data: { status: "RUNNING", progress: 1 } });
  try {
    const tasks = generateTasks(input, job.id);
    const fingerprints = tasks.map(generationFingerprint);
    const duplicates = new Set((await prisma.task.findMany({ where: { projectId: input.projectId, generationFingerprint: { in: fingerprints } }, select: { generationFingerprint: true } })).map((task) => task.generationFingerprint));
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", generatedCount: tasks.length, progress: 100, completedAt: new Date() } });
    revalidatePath("/dashboard/generation/history");
    return { id: job.id, duplicateCount: tasks.filter((task) => duplicates.has(generationFingerprint(task))).length };
  } catch (error) {
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown generation error.", completedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}
