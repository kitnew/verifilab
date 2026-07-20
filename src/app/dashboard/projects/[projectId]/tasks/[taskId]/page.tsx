import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function TaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, include: { project: { select: { name: true } } } });
  if (!task) notFound();
  const tags = Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === "string") : [];

  return (
    <div className="space-y-7">
      <Link href={`/dashboard/projects/${projectId}`} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />{task.project.name}</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="mb-3 flex flex-wrap items-center gap-2"><Badge>{task.status}</Badge><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label(task.difficulty)}</span></div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{task.title}</h1><p className="mt-2 text-sm text-slate-500">Updated {task.updatedAt.toLocaleString()}</p></div><Link href={`/dashboard/projects/${projectId}/tasks/${taskId}/edit`} className={buttonVariants({ variant: "secondary" })}><Pencil className="mr-2 size-4" />Edit task</Link></div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card><CardHeader><h2 className="font-semibold text-slate-950">Prompt</h2></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{task.prompt}</p></CardContent></Card>
        <div className="space-y-5"><Card><CardHeader><h2 className="font-semibold text-slate-950">Verifier</h2></CardHeader><CardContent><p className="mb-3 text-sm font-medium text-indigo-700">{label(task.verifierType)}</p><pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(task.verifierConfig, null, 2)}</pre></CardContent></Card><Card><CardHeader><h2 className="font-semibold text-slate-950">Tags</h2></CardHeader><CardContent className="flex flex-wrap gap-2">{tags.length ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-sm text-slate-400">No tags</span>}</CardContent></Card></div>
      </div>

      <div className="flex justify-end border-t border-slate-200 pt-6"><DeleteTaskButton taskId={taskId} projectId={projectId} /></div>
    </div>
  );
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
