"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { addTasksToDataset, duplicateDataset, removeTaskFromDataset, snapshotDataset } from "@/app/dataset-actions";
import { Button } from "@/components/ui/button";

export function DatasetActions({ datasetId }: { datasetId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ error?: string }>) => startTransition(async () => {
    setError("");
    const result = await action();
    if (result?.error) return setError(result.error);
    router.refresh();
  });

  return <div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending} onClick={() => run(() => duplicateDataset(datasetId))}><Copy className="mr-2 size-4" />Duplicate</Button><Button variant="secondary" disabled={pending} onClick={() => run(() => snapshotDataset(datasetId))}><Save className="mr-2 size-4" />{pending ? "Working…" : "Create snapshot"}</Button></div>{error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}</div>;
}

export function AddDatasetTasks({ datasetId, tasks }: { datasetId: string; tasks: { id: string; title: string; difficulty: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!tasks.length) return <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">No eligible approved tasks are available.</p>;
  return <div className="space-y-4"><div className="max-h-64 space-y-2 overflow-y-auto">{tasks.map((task) => <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} className="size-4 accent-indigo-600" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{task.title}</span><span className="text-xs text-slate-400">{task.difficulty.toLowerCase()}</span></label>)}</div><Button disabled={pending || !selected.length} onClick={() => startTransition(async () => { setError(""); const result = await addTasksToDataset(datasetId, selected); if (result.error) return setError(result.error); setSelected([]); router.refresh(); })}><Plus className="mr-2 size-4" />{pending ? "Adding…" : `Add selected (${selected.length})`}</Button>{error && <p className="text-sm text-red-600" role="alert">{error}</p>}</div>;
}

export function RemoveDatasetTask({ datasetId, taskId }: { datasetId: string; taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="ghost" size="sm" disabled={pending} aria-label="Remove task from dataset" onClick={() => startTransition(async () => { await removeTaskFromDataset(datasetId, taskId); router.refresh(); })}><Trash2 className="size-4 text-red-500" /></Button>;
}
