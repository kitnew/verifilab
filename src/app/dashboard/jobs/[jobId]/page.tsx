import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { JobActions } from "@/components/job-actions";
import { canManageJob, jobDuration } from "@/lib/async-job";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await prisma.asyncJob.findUnique({ where: { id: jobId }, include: { project: { select: { name: true } }, initiator: { select: { name: true } }, retrySource: { select: { id: true } }, retries: { select: { id: true }, orderBy: { createdAt: "desc" } } } });
  if (!job) notFound();
  const actor = await getProjectActor(job.projectId);
  if (!actor || !canManageJob(actor.role, actor.id, job)) notFound();
  const result = resultLink(job.resultReference);
  const duration = jobDuration(job.startedAt, job.completedAt);
  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="mb-1 text-sm font-semibold text-indigo-600">{job.project.name}</p><h1 className="text-3xl font-bold tracking-tight">{label(job.type)}</h1><p className="mt-2 text-slate-500">Started by {job.initiator?.name ?? "Deleted user"} · created {job.createdAt.toLocaleString()}</p></div><JobActions jobId={job.id} status={job.status} /></div>
    <Card><CardHeader><div className="flex items-center justify-between"><h2 className="font-semibold">Lifecycle</h2><Badge>{job.status}</Badge></div></CardHeader><CardContent className="space-y-4"><div><div className="mb-1 flex justify-between text-sm"><span>Progress</span><span>{job.progress}%</span></div><progress className="h-2 w-full accent-indigo-600" max="100" value={job.progress}>{job.progress}%</progress></div><dl className="grid gap-4 text-sm sm:grid-cols-3"><Item name="Input" value={job.inputSummary} /><Item name="Started" value={job.startedAt?.toLocaleString() ?? "—"} /><Item name="Duration" value={duration === null ? "—" : duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`} /></dl>{job.safeErrorMessage && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{job.safeErrorMessage}</p>}{result && <Link className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" href={result.href}>Open result</Link>}</CardContent></Card>
    {(job.retrySource || job.retries.length > 0) && <Card><CardHeader><h2 className="font-semibold">Retry history</h2></CardHeader><CardContent className="flex flex-wrap gap-3 text-sm">{job.retrySource && <Link className="text-indigo-700 hover:underline" href={`/dashboard/jobs/${job.retrySource.id}`}>Source job</Link>}{job.retries.map((retry) => <Link className="text-indigo-700 hover:underline" href={`/dashboard/jobs/${retry.id}`} key={retry.id}>Retry {retry.id.slice(-6)}</Link>)}</CardContent></Card>}
  </div>;
}

function Item({ name, value }: { name: string; value: string }) { return <div><dt className="text-slate-500">{name}</dt><dd className="mt-1 font-medium text-slate-900">{value}</dd></div>; }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function resultLink(value: unknown): { href: string } | null { return value !== null && typeof value === "object" && "href" in value && typeof value.href === "string" && value.href.startsWith("/dashboard/") ? { href: value.href } : null; }
