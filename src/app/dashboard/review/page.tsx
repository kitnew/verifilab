import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ClipboardCheck, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

const difficulties = ["EASY", "MEDIUM", "HARD"] as const;
const statuses = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"] as const;
const selectClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const projectId = single(query.project);
  const difficulty = pick(single(query.difficulty), difficulties);
  const selectedStatus = single(query.status);
  const status = selectedStatus === "ALL" ? undefined : pick(selectedStatus ?? "IN_REVIEW", statuses);
  const where: Prisma.TaskWhereInput = {
    ...(projectId ? { projectId } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(status ? { status } : {}),
  };
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.task.findMany({ where, include: { project: { select: { name: true } }, _count: { select: { reviewComments: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);

  return (
    <div className="space-y-7">
      <div><p className="mb-1 text-sm font-semibold text-indigo-600">Review</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Review queue</h1><p className="mt-2 text-slate-500">Find tasks by project, difficulty, and workflow status.</p></div>
      <Card><CardContent className="py-4"><form className="flex flex-wrap items-end gap-3" method="get"><Filter className="mb-2.5 size-4 text-slate-400" /><FilterField label="Project"><select name="project" defaultValue={projectId} className={selectClass}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FilterField><FilterField label="Difficulty"><select name="difficulty" defaultValue={difficulty} className={selectClass}><option value="">All difficulties</option>{difficulties.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></FilterField><FilterField label="Status"><select name="status" defaultValue={status ?? "ALL"} className={selectClass}><option value="ALL">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></FilterField><button className={buttonVariants({ variant: "secondary" })} type="submit">Apply filters</button></form></CardContent></Card>

      {tasks.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><ClipboardCheck className="mb-4 size-10 text-slate-300" /><h2 className="font-semibold text-slate-900">Queue is clear</h2><p className="mt-1 text-sm text-slate-500">No tasks match the selected filters.</p></CardContent></Card> : (
        <Card><CardHeader><h2 className="font-semibold text-slate-950">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</h2></CardHeader><CardContent className="divide-y divide-slate-100">{tasks.map((task) => <Link key={task.id} href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 hover:text-indigo-600 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.project.name} · {label(task.difficulty)} · {task._count.reviewComments} comments</p></div><Badge>{task.status}</Badge><span className="text-xs text-slate-400">{task.updatedAt.toLocaleDateString()}</span></Link>)}</CardContent></Card>
      )}
    </div>
  );
}

function FilterField({ label: text, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-semibold text-slate-500"><span>{text}</span>{children}</label>;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pick<const T extends readonly string[]>(value: string | undefined, values: T): T[number] | undefined {
  return values.includes(value as T[number]) ? value as T[number] : undefined;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
