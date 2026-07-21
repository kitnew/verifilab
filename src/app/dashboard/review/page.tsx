import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Filter } from "lucide-react";
import { WorkflowAssignmentControls } from "@/components/workflow-assignment-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statuses = ["DRAFT", "IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as const;
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const selectClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm";

export default async function CuratorWorkflowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) return <p>No demo user is available.</p>;
  const curated = user.isAdmin ? await prisma.project.findMany({ select: { id: true, name: true } }) : await prisma.project.findMany({ where: { memberships: { some: { userId: user.id, role: "CURATOR" } } }, select: { id: true, name: true } });
  if (!curated.length) return <Card><CardContent className="py-12 text-center"><h1 className="text-xl font-semibold">Curator access required</h1><p className="mt-2 text-sm text-slate-500">Use My Work for personal author and reviewer assignments.</p></CardContent></Card>;
  const projectIds = curated.map((project) => project.id);
  const projectId = projectIds.includes(single(query.project) ?? "") ? single(query.project) : undefined;
  const assignee = single(query.assignee);
  const status = pick(single(query.status), statuses);
  const priority = pick(single(query.priority), priorities);
  const due = single(query.due);
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    projectId: projectId ?? { in: projectIds },
    ...(assignee ? { OR: [{ assignedAuthorId: assignee }, { assignedReviewerId: assignee }] } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(due === "overdue" ? { dueDate: { lt: now }, status: { notIn: ["APPROVED", "REJECTED"] } } : due === "none" ? { dueDate: null } : {}),
  };
  const [tasks, allTasks, memberships] = await Promise.all([
    prisma.task.findMany({ where, include: { project: { select: { name: true } }, assignedAuthor: { select: { name: true } }, assignedReviewer: { select: { name: true } } }, orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { updatedAt: "desc" }] }),
    prisma.task.findMany({ where: { projectId: { in: projectIds } }, select: { status: true, assignedAuthorId: true, assignedReviewerId: true } }),
    prisma.projectMembership.findMany({ where: { projectId: { in: projectIds } }, include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  const members = [...new Map(memberships.map((membership) => [membership.userId, { id: membership.userId, name: membership.user.name }])).values()];
  const workload = members.map((member) => ({ ...member, author: allTasks.filter((task) => task.assignedAuthorId === member.id && !["APPROVED", "REJECTED"].includes(task.status)).length, review: allTasks.filter((task) => task.assignedReviewerId === member.id && task.status === "IN_REVIEW").length })).filter((member) => member.author || member.review);

  return <div className="space-y-7">
    <div><p className="mb-1 text-sm font-semibold text-indigo-600">Curator</p><h1 className="text-3xl font-bold tracking-tight">Contributor workflow</h1><p className="mt-2 text-slate-500">Assign work, monitor workload, and clear the review backlog.</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="Unassigned tasks" value={allTasks.filter((task) => !task.assignedAuthorId).length} /><Metric label="Tasks without reviewers" value={allTasks.filter((task) => !task.assignedReviewerId && ["IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED"].includes(task.status)).length} /><Metric label="Review backlog" value={allTasks.filter((task) => task.status === "IN_REVIEW").length} /></div>
    <Card><CardContent className="py-4"><form className="flex flex-wrap items-end gap-3" method="get"><Filter className="mb-2.5 size-4 text-slate-400" /><FilterField label="Project"><select name="project" defaultValue={projectId} className={selectClass}><option value="">All projects</option>{curated.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FilterField><FilterField label="Assignee"><select name="assignee" defaultValue={assignee} className={selectClass}><option value="">Anyone</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></FilterField><FilterField label="Status"><select name="status" defaultValue={status} className={selectClass}><option value="">Any status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></FilterField><FilterField label="Priority"><select name="priority" defaultValue={priority} className={selectClass}><option value="">Any priority</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select></FilterField><FilterField label="Due"><select name="due" defaultValue={due} className={selectClass}><option value="">Any due date</option><option value="overdue">Overdue</option><option value="none">No due date</option></select></FilterField><button className={buttonVariants({ variant: "secondary" })}>Apply</button></form></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">Contributor workload</h2></CardHeader><CardContent>{workload.length ? <div className="flex flex-wrap gap-3">{workload.map((member) => <div key={member.id} className="rounded-lg bg-slate-50 px-4 py-3 text-sm"><strong>{member.name}</strong><p className="mt-1 text-xs text-slate-500">{member.author} authoring · {member.review} reviews</p></div>)}</div> : <p className="text-sm text-slate-500">No active assignments.</p>}</CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">Workflow tasks ({tasks.length})</h2></CardHeader><CardContent className="divide-y divide-slate-100">{tasks.map((task) => <div className="space-y-3 py-4 first:pt-0 last:pb-0" key={task.id}><div className="flex flex-wrap items-center gap-2"><Link className="mr-auto font-semibold text-slate-900 hover:text-indigo-600" href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link><span className="text-xs text-slate-500">{task.project.name}</span><Badge>{task.priority}</Badge><Badge>{task.status}</Badge></div><WorkflowAssignmentControls task={{ id: task.id, assignedAuthorId: task.assignedAuthorId, assignedReviewerId: task.assignedReviewerId, priority: task.priority, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? "" }} members={memberships.filter((membership) => membership.projectId === task.projectId).map((membership) => ({ userId: membership.userId, name: membership.user.name, role: membership.role }))} /></div>)}</CardContent></Card>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="py-5"><strong className="text-2xl">{value}</strong><p className="mt-1 text-sm text-slate-500">{label}</p></CardContent></Card>; }
function FilterField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-semibold text-slate-500"><span>{label}</span>{children}</label>; }
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pick<const T extends readonly string[]>(value: string | undefined, values: T): T[number] | undefined { return values.includes(value as T[number]) ? value as T[number] : undefined; }
