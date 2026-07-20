import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { TaskImportRollbackButton } from "@/components/task-import-rollback-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function TaskImportPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const item = await prisma.taskImport.findUnique({ where: { id: importId }, include: { project: { select: { id: true, name: true } } } });
  if (!item) notFound();
  const rejected = rejectedRows(item.rejectedRows);
  return <div className="space-y-7">
    <Link href="/dashboard/imports" className="inline-flex items-center text-sm font-medium text-indigo-700"><ArrowLeft className="mr-2 size-4" />Bulk imports</Link>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{item.filename}</h1><Badge>{item.status}</Badge></div><p className="mt-2 text-slate-500">{item.project.name} · {item.format} · {item.strategy.toLowerCase().replace("_", " ")} · completed {item.completedAt?.toLocaleString() ?? "—"}</p>{item.rolledBackAt && <p className="mt-1 text-sm text-amber-700">Rolled back {item.rolledBackAt.toLocaleString()}</p>}</div>{item.status === "COMPLETED" && <TaskImportRollbackButton importId={item.id} />}</div>
    <div className="grid gap-3 sm:grid-cols-6"><Metric label="Total" value={item.totalCount} /><Metric label="Imported" value={item.importedCount} /><Metric label="Replaced" value={item.replacedCount} /><Metric label="Skipped" value={item.skippedCount} /><Metric label="Duplicates" value={item.duplicateCount} /><Metric label="Rejected" value={item.failedCount} /></div>
    <Card><CardHeader><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-lg font-semibold text-slate-950">Rejected rows</h2><p className="mt-1 text-sm text-slate-500">Rows excluded by server-side validation.</p></div>{rejected.length > 0 && <a href={"/api/task-imports/" + item.id + "/rejected"} className={buttonVariants({ variant: "secondary" })}><Download className="mr-2 size-4" />Download CSV</a>}</div></CardHeader><CardContent>{rejected.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No rejected rows.</p> : <ul className="space-y-3">{rejected.map((row) => <li key={row.rowNumber} className="rounded-lg border border-red-100 bg-red-50 p-4"><p className="font-semibold text-red-900">Row {row.rowNumber}</p><ul className="mt-1 list-disc pl-5 text-sm text-red-800">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-red-700">{row.raw}</pre></li>)}</ul>}</CardContent></Card>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="py-5"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></CardContent></Card>; }
function rejectedRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: { rowNumber: number; errors: string[]; raw: string }[] = [];
  for (const row of value) {
    if (row === null || typeof row !== "object" || !("rowNumber" in row) || typeof row.rowNumber !== "number" || !("errors" in row) || !Array.isArray(row.errors) || !("raw" in row) || typeof row.raw !== "string") continue;
    const errors = row.errors.filter((error: unknown): error is string => typeof error === "string");
    if (errors.length === row.errors.length) result.push({ rowNumber: row.rowNumber, errors, raw: row.raw });
  }
  return result;
}
