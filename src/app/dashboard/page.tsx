import Link from "next/link";
import { ArrowRight, FolderKanban, Plus, ShieldCheck, TestTube2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const projects = await prisma.project.findMany({ include: { _count: { select: { tasks: true } }, tasks: { select: { status: true } } }, orderBy: { updatedAt: "desc" } });
  const taskCount = projects.reduce((sum, project) => sum + project._count.tasks, 0);
  const approvedCount = projects.flatMap((project) => project.tasks).filter((task) => task.status === "APPROVED").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-1 text-sm font-semibold text-indigo-600">Workspace</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Projects</h1><p className="mt-2 text-slate-500">Build and review deterministic evaluation tasks.</p></div>
        <Link href="/dashboard/projects/new" className={buttonVariants()}><Plus className="mr-2 size-4" />New project</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3"><Stat icon={FolderKanban} label="Projects" value={projects.length} /><Stat icon={TestTube2} label="Total tasks" value={taskCount} /><Stat icon={ShieldCheck} label="Approved" value={approvedCount} /></div>
      {projects.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><FolderKanban className="mb-4 size-10 text-slate-300" /><h2 className="font-semibold text-slate-900">No projects yet</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Create a project to start authoring verifiable tasks.</p><Link href="/dashboard/projects/new" className={buttonVariants({ className: "mt-5" })}>Create project</Link></CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{projects.map((project) => (
          <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="group"><Card className="h-full transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><CardHeader className="flex flex-row items-start justify-between"><div><h2 className="text-lg font-semibold text-slate-950">{project.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{project.description || "No description"}</p></div><ArrowRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-600" /></CardHeader><CardContent className="flex items-center gap-4 text-xs font-medium text-slate-500"><span>{project._count.tasks} tasks</span><span>{project.tasks.filter((task) => task.status === "APPROVED").length} approved</span><span className="ml-auto">Updated {project.updatedAt.toLocaleDateString()}</span></CardContent></Card></Link>
        ))}</div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return <Card><CardContent className="flex items-center gap-4 py-5"><span className="grid size-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Icon className="size-5" /></span><span><strong className="block text-2xl text-slate-950">{value}</strong><span className="text-sm text-slate-500">{label}</span></span></CardContent></Card>;
}
