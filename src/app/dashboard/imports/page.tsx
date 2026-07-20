import Link from "next/link";
import { History } from "lucide-react";
import { TaskImportStudio } from "@/components/task-import-studio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { MAX_TASK_IMPORT_BYTES, MAX_TASK_IMPORT_ROWS } from "@/lib/task-import";

export default async function TaskImportsPage() {
  const [projects, imports] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.taskImport.findMany({ include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Authoring</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Bulk Import</h1><p className="mt-2 text-slate-500">Validate RLVR task files, inspect duplicates, then import drafts.</p></div>
    {projects.length ? <TaskImportStudio projects={projects} maxBytes={MAX_TASK_IMPORT_BYTES} maxRows={MAX_TASK_IMPORT_ROWS} /> : <Card className="border-dashed"><CardContent className="py-12 text-center"><h2 className="font-semibold">Create a project first</h2><p className="mt-1 text-sm text-slate-500">Imports always target an existing project.</p></CardContent></Card>}
    <section className="space-y-3"><h2 className="text-xl font-semibold text-slate-950">Import history</h2>{imports.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><History className="mb-3 size-8 text-slate-300" /><p className="font-medium">No imports yet</p></CardContent></Card> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">File</th><th className="px-5 py-3">Project</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Summary</th><th className="px-5 py-3">Completed</th></tr></thead><tbody className="divide-y divide-slate-100">{imports.map((item) => <tr key={item.id}><td className="px-5 py-4 font-medium"><Link className="text-indigo-700 hover:underline" href={`/dashboard/imports/${item.id}`}>{item.filename}</Link><span className="ml-2 text-xs text-slate-400">{item.format}</span></td><td className="px-5 py-4">{item.project.name}</td><td className="px-5 py-4"><Badge>{item.status}</Badge></td><td className="px-5 py-4 text-slate-600">{item.importedCount} imported · {item.failedCount} failed</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{item.completedAt?.toLocaleString() ?? "—"}</td></tr>)}</tbody></table></div></Card>}</section>
  </div>;
}
