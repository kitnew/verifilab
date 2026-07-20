import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/task-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function NewTaskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) notFound();

  return <div className="mx-auto max-w-3xl"><Link href={`/dashboard/projects/${projectId}`} className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />{project.name}</Link><Card><CardHeader><h1 className="text-2xl font-bold text-slate-950">Create task</h1><p className="mt-1 text-sm text-slate-500">Define the prompt and one deterministic verifier.</p></CardHeader><CardContent><TaskForm projectId={projectId} /></CardContent></Card></div>;
}
