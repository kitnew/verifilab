import Link from "next/link";
import { History } from "lucide-react";
import { GenerationJobActions } from "@/components/generation-job-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function GenerationHistoryPage() {
  const jobs = await prisma.generationJob.findMany({ include: { project: { select: { name: true } }, _count: { select: { tasks: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Generation</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Generation history</h1><p className="mt-2 text-slate-500">Latest 100 deterministic generation jobs.</p></div><Link className={buttonVariants()} href="/dashboard/generation">New generation</Link></div>{jobs.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><History className="mb-4 size-10 text-slate-300" /><h2 className="font-semibold">No generation jobs yet</h2><p className="mt-1 text-sm text-slate-500">Generate a preview to create the first history entry.</p></CardContent></Card> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Created</th><th className="px-5 py-3">Project</th><th className="px-5 py-3">Generator</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Tasks</th><th className="px-5 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-100">{jobs.map((job) => <tr key={job.id}><td className="whitespace-nowrap px-5 py-4 text-slate-500">{job.createdAt.toLocaleString()}</td><td className="px-5 py-4 font-medium text-slate-900">{job.project.name}</td><td className="px-5 py-4 text-slate-600">{label(job.generatorType)} · seed {job.seed}</td><td className="px-5 py-4"><Badge>{job.status}</Badge>{job.errorMessage && <p className="mt-1 max-w-xs text-xs text-red-600">{job.errorMessage}</p>}</td><td className="min-w-32 px-5 py-4"><progress aria-label={`${job.progress}% complete`} className="h-2 w-full accent-indigo-600" max="100" value={job.progress}>{job.progress}%</progress><span className="text-xs text-slate-500">{job.progress}%</span></td><td className="px-5 py-4 text-slate-600">{job._count.tasks} saved / {job.generatedCount} generated</td><td className="px-5 py-4"><GenerationJobActions jobId={job.id} status={job.status} taskCount={job._count.tasks} /></td></tr>)}</tbody></table></div></Card>}</div>;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
