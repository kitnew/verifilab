import Link from "next/link";
import { ArrowRight, Database, FolderKanban, Plus, ShieldCheck, TestTube2 } from "lucide-react";
import { AuditTimeline } from "@/components/audit-timeline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { percentage } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

const statuses = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"] as const;
const verifiers = ["EXACT_MATCH", "NUMERIC", "REGEX"] as const;

export default async function DashboardPage() {
  const [projects, statusGroups, verifierGroups, verificationGroups, datasetCount, recentActivity, recentTasks] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true, description: true, updatedAt: true, _count: { select: { tasks: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.task.groupBy({ by: ["verifierType"], _count: { _all: true } }),
    prisma.verificationRun.groupBy({ by: ["passed"], _count: { _all: true } }),
    prisma.dataset.count(),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } } }),
    prisma.task.findMany({ orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, projectId: true, title: true, status: true, updatedAt: true, project: { select: { name: true } } } }),
  ]);
  const statusCounts = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const verifierCounts = new Map(verifierGroups.map((group) => [group.verifierType, group._count._all]));
  const taskCount = statusGroups.reduce((total, group) => total + group._count._all, 0);
  const approved = statusCounts.get("APPROVED") ?? 0;
  const rejected = statusCounts.get("REJECTED") ?? 0;
  const decided = approved + rejected;
  const verificationCount = verificationGroups.reduce((total, group) => total + group._count._all, 0);
  const passed = verificationGroups.find((group) => group.passed)?._count._all ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-1 text-sm font-semibold text-indigo-600">Workspace</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Dashboard</h1><p className="mt-2 text-slate-500">Database-backed health and activity for your evaluation workspace.</p></div>
        <Link href="/dashboard/projects/new" className={buttonVariants()}><Plus className="mr-2 size-4" />New project</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={FolderKanban} label="Projects" value={projects.length} />
        <Stat icon={TestTube2} label="Tasks" value={taskCount} />
        <Stat icon={Database} label="Datasets" value={datasetCount} />
        <Stat icon={ShieldCheck} label="Approval rate" value={`${percentage(approved, decided)}%`} detail={`${approved} of ${decided} decided`} />
        <Stat icon={TestTube2} label="Verification pass rate" value={`${percentage(passed, verificationCount)}%`} detail={`${passed} of ${verificationCount} runs`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="Tasks by status" total={taskCount} items={statuses.map((status) => ({ label: label(status), value: statusCounts.get(status) ?? 0, color: statusColor(status) }))} />
        <Breakdown title="Tasks by verifier" total={taskCount} items={verifiers.map((verifier) => ({ label: label(verifier), value: verifierCounts.get(verifier) ?? 0, color: "bg-indigo-500" }))} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">Recent activity</h2><Link className="text-sm font-medium text-indigo-600 hover:text-indigo-700" href="/dashboard/activity">View all activity</Link></CardHeader><CardContent><AuditTimeline events={recentActivity} showProject showTask /></CardContent></Card>
        <Card><CardHeader className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">Recently updated tasks</h2><Link className="text-sm font-medium text-indigo-600 hover:text-indigo-700" href="/dashboard/tasks">View all tasks</Link></CardHeader><CardContent>{recentTasks.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No tasks yet.</p> : <div className="divide-y divide-slate-100">{recentTasks.map((task) => <Link className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`} key={task.id}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.project.name} · Updated {task.updatedAt.toLocaleString()}</p></div><Badge>{task.status}</Badge></Link>)}</div>}</CardContent></Card>
      </div>

      <div><h2 className="mb-4 text-xl font-semibold text-slate-950">Projects</h2>{projects.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><FolderKanban className="mb-4 size-10 text-slate-300" /><h3 className="font-semibold text-slate-900">No projects yet</h3><p className="mt-1 max-w-sm text-sm text-slate-500">Create a project to start authoring verifiable tasks.</p><Link href="/dashboard/projects/new" className={buttonVariants({ className: "mt-5" })}>Create project</Link></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{projects.map((project) => <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="group"><Card className="h-full transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><CardHeader className="flex-row items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-950">{project.name}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{project.description || "No description"}</p></div><ArrowRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-600" /></CardHeader><CardContent className="flex items-center text-xs font-medium text-slate-500"><span>{project._count.tasks} tasks</span><span className="ml-auto">Updated {project.updatedAt.toLocaleDateString()}</span></CardContent></Card></Link>)}</div>}</div>
    </div>
  );
}

function Stat({ icon: Icon, label: text, value, detail }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; detail?: string }) {
  return <Card><CardContent className="flex items-center gap-4 py-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Icon className="size-5" /></span><span><strong className="block text-2xl text-slate-950">{value}</strong><span className="text-sm text-slate-500">{text}</span>{detail && <span className="mt-0.5 block text-xs text-slate-400">{detail}</span>}</span></CardContent></Card>;
}

function Breakdown({ title, total, items }: { title: string; total: number; items: { label: string; value: number; color: string }[] }) {
  return <Card><CardHeader><h2 className="font-semibold text-slate-950">{title}</h2><p className="text-sm text-slate-500">{total} total tasks</p></CardHeader><CardContent className="space-y-4">{items.map((item) => { const rate = percentage(item.value, total); return <div aria-label={`${item.label}: ${item.value} of ${total} tasks`} key={item.label}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium text-slate-700">{item.label}</span><span className="text-slate-500">{item.value} · {rate}%</span></div><div aria-valuemax={Math.max(total, 1)} aria-valuemin={0} aria-valuenow={item.value} className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${rate}%` }} /></div></div>; })}</CardContent></Card>;
}

function statusColor(status: typeof statuses[number]) {
  return { DRAFT: "bg-slate-400", IN_REVIEW: "bg-amber-500", APPROVED: "bg-emerald-500", REJECTED: "bg-red-500" }[status];
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
