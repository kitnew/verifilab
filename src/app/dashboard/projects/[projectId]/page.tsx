import Link from "next/link";
import { ChevronLeft, FileText, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { AuditTimeline } from "@/components/audit-timeline";
import { ProjectMemberships } from "@/components/project-memberships";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getProjectActor } from "@/lib/demo-role";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, actor, users] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { tasks: { orderBy: { updatedAt: "desc" } }, memberships: { include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }, auditEvents: { orderBy: { createdAt: "desc" }, take: 50, include: { task: { select: { id: true, title: true } } } } } }),
    getProjectActor(projectId),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!project) notFound();
  const role = actor?.role ?? "AUTHOR";

  return (
    <div className="space-y-7">
      <Link href="/dashboard" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />Projects</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-1 text-sm font-semibold text-indigo-600">Project</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">{project.name}</h1><p className="mt-2 max-w-2xl text-slate-500">{project.description || "No description"}</p></div>
        {can(role, "CREATE_TASK") && <Link href={`/dashboard/projects/${projectId}/tasks/new`} className={buttonVariants()}><Plus className="mr-2 size-4" />New task</Link>}
      </div>

      {project.tasks.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><FileText className="mb-4 size-10 text-slate-300" /><h2 className="font-semibold text-slate-900">No tasks yet</h2><p className="mt-1 text-sm text-slate-500">Create the first verifiable task in this project.</p>{can(role, "CREATE_TASK") && <Link href={`/dashboard/projects/${projectId}/tasks/new`} className={buttonVariants({ className: "mt-5" })}>Create task</Link>}</CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Task</th><th className="px-5 py-3 font-semibold">Verifier</th><th className="px-5 py-3 font-semibold">Difficulty</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{project.tasks.map((task) => (
            <tr key={task.id} className="transition-colors hover:bg-slate-50"><td className="px-5 py-4"><Link href={`/dashboard/projects/${projectId}/tasks/${task.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">{task.title}</Link></td><td className="px-5 py-4 text-slate-500">{label(task.verifierType)}</td><td className="px-5 py-4 text-slate-500">{label(task.difficulty)}</td><td className="px-5 py-4"><Badge>{task.status}</Badge></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{task.updatedAt.toLocaleDateString()}</td></tr>
          ))}</tbody></table></div>
        </Card>
      )}
      {role === "ADMIN" && <Card><CardHeader><h2 className="font-semibold">Project members</h2><p className="mt-1 text-sm text-slate-500">Add users and set their project-scoped role.</p></CardHeader><CardContent><ProjectMemberships projectId={projectId} users={users} memberships={project.memberships.map((membership) => ({ userId: membership.userId, name: membership.user.name, role: membership.role }))} /></CardContent></Card>}
      <Card><CardHeader><h2 className="font-semibold text-slate-950">Project activity</h2><p className="mt-1 text-sm text-slate-500">Latest 50 audit events for this project.</p></CardHeader><CardContent><AuditTimeline events={project.auditEvents.map((event) => ({ ...event, project: { id: project.id, name: project.name } }))} showTask /></CardContent></Card>
    </div>
  );
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
