import Link from "next/link";
import { ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDemoUser } from "@/lib/demo-role";
import { myWorkSections } from "@/lib/my-work";
import { prisma } from "@/lib/prisma";

export default async function MyWorkPage() {
  const user = await getDemoUser();
  if (!user) return <p>No demo user is available. Seed the database first.</p>;
  const tasks = await prisma.task.findMany({
    where: { OR: [{ assignedAuthorId: user.id }, { assignedReviewerId: user.id }] },
    include: { project: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
  });
  const sections = myWorkSections(tasks, user.id);

  return <div className="space-y-7">
    <div><p className="mb-1 text-sm font-semibold text-indigo-600">Contributor workflow</p><h1 className="text-3xl font-bold tracking-tight">My Work</h1><p className="mt-2 text-slate-500">Assignments for {user.name} across projects.</p></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <WorkSection title="Assigned for authoring" tasks={sections.authoring} empty="No authoring assignments." />
      <WorkSection title="Waiting for your review" tasks={sections.review} empty="No reviews are waiting." />
      <WorkSection title="Changes requested" tasks={sections.changes} empty="No tasks need changes." />
      <WorkSection title="Overdue assignments" tasks={sections.overdue} empty="Nothing is overdue." />
      <WorkSection className="lg:col-span-2" title="Recently completed" tasks={sections.completed.slice(0, 10)} empty="No completed assignments yet." />
    </div>
  </div>;
}

type DisplayTask = Awaited<ReturnType<typeof prisma.task.findMany<{ include: { project: { select: { name: true } } } }>>>[number];

function WorkSection({ title, tasks, empty, className = "" }: { title: string; tasks: DisplayTask[]; empty: string; className?: string }) {
  return <Card className={className}><CardHeader><h2 className="font-semibold">{title} <span className="text-slate-400">({tasks.length})</span></h2></CardHeader><CardContent>{tasks.length ? <div className="divide-y divide-slate-100">{tasks.map((task) => <Link key={task.id} href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.project.name}{task.dueDate ? ` · due ${task.dueDate.toLocaleDateString()}` : ""}</p></div><Badge>{task.priority}</Badge><Badge>{task.status}</Badge></Link>)}</div> : <div className="flex flex-col items-center py-8 text-center text-sm text-slate-500"><ListTodo className="mb-3 size-7 text-slate-300" />{empty}</div>}</CardContent></Card>;
}
