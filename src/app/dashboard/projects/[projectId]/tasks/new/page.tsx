import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/task-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDemoRole } from "@/lib/demo-role";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";

export default async function NewTaskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, role] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    getDemoRole(),
  ]);
  if (!project) notFound();

  if (!can(role, "CREATE_TASK")) return <AccessDenied />;
  return <div className="mx-auto max-w-3xl"><Link href={`/dashboard/projects/${projectId}`} className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />{project.name}</Link><Card><CardHeader><h1 className="text-2xl font-bold text-slate-950">Create task</h1><p className="mt-1 text-sm text-slate-500">Define the prompt and one deterministic verifier.</p></CardHeader><CardContent><TaskForm projectId={projectId} /></CardContent></Card></div>;
}

function AccessDenied() {
  return <Card><CardContent className="py-12 text-center"><h1 className="text-xl font-semibold">Author access required</h1><p className="mt-2 text-sm text-slate-500">Switch to Author or Admin to create tasks.</p></CardContent></Card>;
}
