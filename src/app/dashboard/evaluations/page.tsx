import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { FlaskConical, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { evaluationBatchStatuses } from "@/lib/evaluation";
import { EVALUATION_PAGE_SIZE, evaluationSearchHref, evaluationSorts, parseEvaluationSearch } from "@/lib/evaluation-search";
import { prisma } from "@/lib/prisma";

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default async function EvaluationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = parseEvaluationSearch(await searchParams);
  const where: Prisma.EvaluationBatchWhereInput = {
    ...(search.q ? { OR: [{ name: { contains: search.q } }, { task: { title: { contains: search.q } } }] } : {}),
    ...(search.projectId ? { task: { projectId: search.projectId } } : {}),
    ...(search.taskId ? { taskId: search.taskId } : {}),
    ...(search.status ? { status: search.status } : {}),
    ...(search.model ? { modelName: { contains: search.model } } : {}),
  };
  const [projects, tasks, total] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.evaluationBatch.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / EVALUATION_PAGE_SIZE)); const page = Math.min(search.page, totalPages);
  const batches = await prisma.evaluationBatch.findMany({ where, include: { task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } } }, orderBy: { createdAt: search.sort === "oldest" ? "asc" : "desc" }, skip: (page - 1) * EVALUATION_PAGE_SIZE, take: EVALUATION_PAGE_SIZE });
  const hasFilters = Boolean(search.q || search.projectId || search.taskId || search.status || search.model || search.sort !== "newest");
  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Rollout Evaluation Lab</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Evaluations</h1><p className="mt-2 text-slate-500">Batch verification, reward analytics, reruns, and rollout exports.</p></div><Link className={buttonVariants()} href="/dashboard/evaluations/new">New evaluation</Link></div>
    <Card><CardContent className="py-5"><form className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" method="get"><Filter label="Search"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" defaultValue={search.q} name="q" placeholder="Batch or task" /></div></Filter><Filter label="Project"><select className={selectClass} defaultValue={search.projectId} name="project"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Filter><Filter label="Task"><select className={selectClass} defaultValue={search.taskId} name="task"><option value="">All tasks</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></Filter><Filter label="Status"><select className={selectClass} defaultValue={search.status} name="status"><option value="">All statuses</option>{evaluationBatchStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></Filter><Filter label="Model name"><Input defaultValue={search.model} name="model" /></Filter><Filter label="Sort"><select className={selectClass} defaultValue={search.sort} name="sort">{evaluationSorts.map((sort) => <option key={sort} value={sort}>{label(sort)}</option>)}</select></Filter><div className="flex items-end gap-2 md:col-span-2"><button className={buttonVariants()} type="submit">Apply</button><Link className={buttonVariants({ variant: "secondary" })} href="/dashboard/evaluations">Reset</Link></div></form></CardContent></Card>
    {batches.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><FlaskConical className="mb-4 size-10 text-slate-300" /><h2 className="font-semibold">{hasFilters ? "No matching evaluations" : "No evaluation batches yet"}</h2><p className="mt-1 text-sm text-slate-500">{hasFilters ? "Change or reset the current filters." : "Start from a task or create a new evaluation batch."}</p></CardContent></Card> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Batch</th><th className="px-5 py-3">Task</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Model</th><th className="px-5 py-3">Responses</th><th className="px-5 py-3">Pass rate</th><th className="px-5 py-3">Duration</th><th className="px-5 py-3">Created</th></tr></thead><tbody className="divide-y divide-slate-100">{batches.map((batch) => <tr key={batch.id}><td className="px-5 py-4"><Link className="font-semibold text-slate-900 hover:text-indigo-600" href={`/dashboard/evaluations/${batch.id}`}>{batch.name}</Link><p className="mt-1 text-xs text-slate-500">{batch.createdBy ? label(batch.createdBy) : "Demo user"}</p></td><td className="px-5 py-4"><Link className="text-slate-700 hover:text-indigo-600" href={`/dashboard/projects/${batch.task.project.id}/tasks/${batch.task.id}`}>{batch.task.title}</Link><p className="mt-1 text-xs text-slate-500">{batch.task.project.name}</p></td><td className="px-5 py-4"><Badge>{batch.status}</Badge></td><td className="px-5 py-4 text-slate-500">{batch.modelName || "—"}{batch.modelVersion ? ` · ${batch.modelVersion}` : ""}</td><td className="px-5 py-4 text-slate-500">{batch.processedCount} / {batch.requestedCount}</td><td className="px-5 py-4 font-medium">{percentage(batch.passedCount, batch.passedCount + batch.failedCount)}</td><td className="px-5 py-4 text-slate-500">{duration(batch.startedAt, batch.completedAt)}</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{batch.createdAt.toLocaleString()}</td></tr>)}</tbody></table></div><div className="flex justify-between border-t border-slate-200 p-4">{page > 1 ? <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={evaluationSearchHref(search, page - 1)}>Previous</Link> : <span />}{page < totalPages && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={evaluationSearchHref(search, page + 1)}>Next</Link>}</div></Card>}
  </div>;
}

function Filter({ label: text, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-semibold text-slate-500"><span>{text}</span>{children}</label>; }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function percentage(value: number, total: number) { return total ? `${(value / total * 100).toFixed(1)}%` : "0.0%"; }
function duration(start: Date | null, end: Date | null) { return start && end ? `${Math.max(0, end.getTime() - start.getTime())} ms` : "—"; }
