import { notFound } from "next/navigation";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DatasetLayout({ children, params }: { children: React.ReactNode; params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { projectId: true } });
  if (!dataset || !await getProjectActor(dataset.projectId)) notFound();
  return children;
}
