import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { asyncJobStatuses, asyncJobTypes, jobDuration } from "@/lib/async-job";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const selectClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const filters = await searchParams;
  const memberships = await prisma.projectMembership.findMany({ where: { userId: user.id }, select: { projectId: true, role: true } });
  const access: Prisma.AsyncJobWhereInput[] = user.isAdmin
    ? [{ project: { guestWorkspaceId: user.guestWorkspaceId } }]
    : memberships.map((membership) => membership.role === "ADMIN" || membership.role === "CURATOR" || membership.role === "OPERATOR"
      ? { projectId: membership.projectId }
      : membership.role === "AUTHOR"
        ? { projectId: membership.projectId, initiatorId: user.id, type: { in: ["BATCH_TASK_GENERATION", "BULK_IMPORT"] } }
        : { projectId: membership.projectId, type: { in: ["ROLLOUT_EVALUATION", "DATASET_QUALITY_SCAN", "DATASET_RELEASE"] } });
  const where: Prisma.AsyncJobWhereInput = { OR: access.length ? access : [{ id: "__none__" }] };
  if (asyncJobStatuses.includes(filters.status as never)) where.status = filters.status as Prisma.EnumAsyncJobStatusFilter;
  if (asyncJobTypes.includes(filters.type as never)) where.type = filters.type as Prisma.EnumAsyncJobTypeFilter;
  if (filters.initiator) where.initiatorId = filters.initiator;
  if (filters.date) { const start = new Date(`${filters.date}T00:00:00`); if (!Number.isNaN(start.getTime())) where.createdAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) }; }
  const [jobs, initiators] = await Promise.all([
    prisma.asyncJob.findMany({ where, include: { project: { select: { name: true } }, initiator: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.user.findMany({ where: { initiatedJobs: { some: { OR: access.length ? access : [{ id: "__none__" }] } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Project operations</p><h1 className="text-3xl font-bold tracking-tight">Job Center</h1><p className="mt-2 text-slate-500">Persistent progress, results, failures, retries and cooperative cancellation.</p></div>
    <Card><CardContent className="py-5"><form className="flex flex-wrap gap-3"><select className={selectClass} defaultValue={filters.status ?? ""} name="status"><option value="">All statuses</option>{asyncJobStatuses.map((value) => <option key={value}>{value}</option>)}</select><select className={selectClass} defaultValue={filters.type ?? ""} name="type"><option value="">All types</option>{asyncJobTypes.map((value) => <option key={value}>{label(value)}</option>)}</select><select className={selectClass} defaultValue={filters.initiator ?? ""} name="initiator"><option value="">All initiators</option>{initiators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className={selectClass} defaultValue={filters.date ?? ""} name="date" type="date" /><button className="rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">Filter</button></form></CardContent></Card>
    {jobs.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Job</th><th className="px-5 py-3">Project</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Duration</th></tr></thead><tbody className="divide-y">{jobs.map((job) => <tr key={job.id}><td className="px-5 py-4"><Link className="font-semibold text-indigo-700 hover:underline" href={`/dashboard/jobs/${job.id}`}>{label(job.type)}</Link><p className="mt-1 text-xs text-slate-500">{job.inputSummary} · {job.initiator?.name ?? "Deleted user"}</p></td><td className="px-5 py-4">{job.project.name}</td><td className="px-5 py-4"><Badge>{job.status}</Badge></td><td className="px-5 py-4"><progress className="accent-indigo-600" max="100" value={job.progress}>{job.progress}%</progress><span className="ml-2">{job.progress}%</span></td><td className="px-5 py-4">{duration(jobDuration(job.startedAt, job.completedAt))}</td></tr>)}</tbody></table></div></Card> : <Card className="border-dashed"><CardContent className="py-16 text-center"><h2 className="font-semibold">No jobs found</h2><p className="mt-1 text-sm text-slate-500">Start a supported operation or clear the current filters.</p></CardContent></Card>}
  </div>;
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function duration(value: number | null) { if (value === null) return "—"; if (value < 1000) return `${value} ms`; return `${(value / 1000).toFixed(1)} s`; }
