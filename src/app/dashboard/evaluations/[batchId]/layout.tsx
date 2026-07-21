import { notFound } from "next/navigation";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function EvaluationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { task: { select: { projectId: true } } } });
  if (!batch || !await getProjectActor(batch.task.projectId)) notFound();
  return children;
}
