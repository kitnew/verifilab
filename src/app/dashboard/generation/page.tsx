import { GenerationStudio } from "@/components/generation-studio";
import { Card, CardContent } from "@/components/ui/card";
import { generateTasks, generationFingerprint } from "@/lib/generation";
import { prisma } from "@/lib/prisma";

export default async function GenerationPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job: jobId } = await searchParams;
  const [projects, job] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    jobId ? prisma.generationJob.findUnique({ where: { id: jobId } }) : null,
  ]);
  let initialTasks;
  if (job?.status === "COMPLETED") {
    const tasks = generateTasks({ projectId: job.projectId, generatorType: job.generatorType, count: job.requestedCount, difficulty: job.difficulty, seed: job.seed }, job.id);
    const fingerprints = tasks.map(generationFingerprint);
    const duplicates = new Set((await prisma.task.findMany({ where: { projectId: job.projectId, generationFingerprint: { in: fingerprints } }, select: { generationFingerprint: true } })).map((task) => task.generationFingerprint));
    initialTasks = tasks.map((task) => ({ ...task, duplicate: duplicates.has(generationFingerprint(task)) }));
  }

  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Deterministic authoring</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Batch Task Generation Studio</h1><p className="mt-2 text-slate-500">Generate reproducible machine-verifiable draft tasks without external APIs.</p></div>{projects.length === 0 ? <Card className="border-dashed"><CardContent className="py-16 text-center"><h2 className="font-semibold">Create a project first</h2><p className="mt-1 text-sm text-slate-500">Generation jobs must belong to a project.</p></CardContent></Card> : <GenerationStudio projects={projects} initialJobId={initialTasks ? job?.id : undefined} initialTasks={initialTasks} />}</div>;
}
