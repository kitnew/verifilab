import { notFound } from "next/navigation";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ImportLayout({ children, params }: { children: React.ReactNode; params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const record = await prisma.taskImport.findUnique({ where: { id: importId }, select: { projectId: true } });
  if (!record || !await getProjectActor(record.projectId)) notFound();
  return children;
}
