"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { bulkTaskAction, type BulkTaskOperation, type BulkTaskResult } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TaskRow = { id: string; projectId: string; title: string; project: string; verifierType: string; difficulty: string; status: string; tags: string[]; createdAt: string };
type DatasetOption = { id: string; name: string; project: string };

const selectClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function BulkTaskTable({ tasks, datasets, total, page, totalPages, previousHref, nextHref }: { tasks: TaskRow[]; datasets: DatasetOption[]; total: number; page: number; totalPages: number; previousHref?: string; nextHref?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<BulkTaskOperation>("SUBMIT");
  const [tags, setTags] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [result, setResult] = useState<BulkTaskResult>();
  const [pending, startTransition] = useTransition();
  const allSelected = tasks.length > 0 && tasks.every((task) => selected.has(task.id));

  function toggle(taskId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  function run() {
    if (operation === "DELETE_DRAFTS" && !window.confirm("Delete the selected draft tasks? This cannot be undone.")) return;
    startTransition(async () => {
      const response = await bulkTaskAction({ operation, taskIds: [...selected], tags, datasetId });
      setResult(response);
      if (!response.error) setSelected(new Set());
      if (response.succeeded.length > 0) router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">{total} {total === 1 ? "task" : "tasks"}</h2><span className="text-sm text-slate-500">Page {page} of {totalPages}</span></div>
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-500"><span>Bulk action</span><select className={selectClass} value={operation} onChange={(event) => setOperation(event.target.value as BulkTaskOperation)}><option value="SUBMIT">Submit for review</option><option value="ADD_TAGS">Add tags</option><option value="DELETE_DRAFTS">Delete drafts</option><option value="ADD_TO_DATASET">Add approved to dataset</option></select></label>
          {operation === "ADD_TAGS" && <label className="grid min-w-56 gap-1 text-xs font-semibold text-slate-500"><span>Tags</span><Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="math, reasoning" /></label>}
          {operation === "ADD_TO_DATASET" && <label className="grid min-w-56 gap-1 text-xs font-semibold text-slate-500"><span>Dataset</span><select className={selectClass} value={datasetId} onChange={(event) => setDatasetId(event.target.value)}><option value="">Choose dataset</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.project}</option>)}</select></label>}
          <Button disabled={pending || selected.size === 0} onClick={run}>{pending ? "Applying…" : `Apply to ${selected.size}`}</Button>
        </div>
        {result && <div aria-live="polite" className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-medium text-emerald-700">{result.succeeded.length} succeeded</p>{result.error && <p className="mt-1 text-red-700">{result.error}</p>}{result.failures.length > 0 && <div className="mt-2 text-red-700"><p className="font-medium">{result.failures.length} failed:</p><ul className="mt-1 list-disc pl-5">{result.failures.map((failure) => <li key={failure.taskId}>{failure.title}: {failure.error}</li>)}</ul></div>}</div>}
      </CardHeader>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3"><input aria-label="Select all tasks on this page" checked={allSelected} type="checkbox" onChange={() => setSelected(allSelected ? new Set() : new Set(tasks.map((task) => task.id)))} /></th><th className="px-5 py-3 font-semibold">Task</th><th className="px-5 py-3 font-semibold">Project</th><th className="px-5 py-3 font-semibold">Verifier</th><th className="px-5 py-3 font-semibold">Difficulty</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Created</th></tr></thead><tbody className="divide-y divide-slate-100">{tasks.map((task) => <tr className="transition-colors hover:bg-slate-50" key={task.id}><td className="px-5 py-4"><input aria-label={`Select ${task.title}`} checked={selected.has(task.id)} type="checkbox" onChange={() => toggle(task.id)} /></td><td className="max-w-80 px-5 py-4"><Link className="block truncate font-semibold text-slate-900 hover:text-indigo-600" href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link><p className="mt-1 truncate text-xs text-slate-500">{task.tags.join(", ") || "No tags"}</p></td><td className="px-5 py-4 text-slate-500">{task.project}</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{label(task.verifierType)}</td><td className="px-5 py-4 text-slate-500">{label(task.difficulty)}</td><td className="px-5 py-4"><Badge>{task.status}</Badge></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{new Date(task.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
      <CardContent className="flex items-center justify-between border-t border-slate-200 py-4">{previousHref ? <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={previousHref}><ChevronLeft className="mr-1 size-4" />Previous</Link> : <span />}{nextHref && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={nextHref}>Next<ChevronRight className="ml-1 size-4" /></Link>}</CardContent>
    </Card>
  );
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
