import Link from "next/link";
import { ChevronLeft, Download, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { AddDatasetTasks, DatasetActions, RemoveDatasetTask } from "@/components/dataset-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

const difficulties = ["EASY", "MEDIUM", "HARD"] as const;
const verifierTypes = ["EXACT_MATCH", "NUMERIC", "REGEX"] as const;

export default async function DatasetPage({ params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: {
      project: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" }, include: { task: true } },
      versions: { orderBy: { version: "desc" } },
      releases: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!dataset) notFound();
  const eligibleTasks = await prisma.task.findMany({
    where: { projectId: dataset.projectId, status: "APPROVED", datasetItems: { none: { datasetId } } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, difficulty: true },
  });

  return <div className="space-y-7">
    <Link href="/dashboard/datasets" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />Datasets</Link>
    <nav aria-label="Dataset sections" className="flex gap-2"><span className={buttonVariants({ size: "sm" })}>Dataset</span><Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/dashboard/datasets/${dataset.id}/quality`}>Quality</Link></nav>
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="mb-1 text-sm font-semibold text-indigo-600">{dataset.project.name}</p><h1 className="text-3xl font-bold tracking-tight">{dataset.name}</h1><p className="mt-2 max-w-2xl text-slate-500">{dataset.description || "No description"}</p></div><div className="flex flex-wrap gap-2"><Link href={`/dashboard/datasets/${datasetId}/releases/new`} className={buttonVariants()}>Create release</Link><Link href={`/api/datasets/${datasetId}/export?format=jsonl`} className={buttonVariants({ variant: "secondary" })}><Download className="mr-2 size-4" />JSONL</Link><Link href={`/api/datasets/${datasetId}/export?format=json`} className={buttonVariants({ variant: "secondary" })}><Download className="mr-2 size-4" />JSON</Link><Link href={`/dashboard/datasets/${datasetId}/edit`} className={buttonVariants({ variant: "secondary" })}><Pencil className="mr-2 size-4" />Edit</Link></div></div>

    <DatasetActions datasetId={datasetId} />

    <div className="grid gap-4 lg:grid-cols-2">
      <CountCard title="Tasks by difficulty" values={difficulties.map((value) => [label(value), dataset.items.filter((item) => item.task.difficulty === value).length])} />
      <CountCard title="Tasks by verifier" values={verifierTypes.map((value) => [label(value), dataset.items.filter((item) => item.task.verifierType === value).length])} />
    </div>

    <Card><CardHeader><h2 className="text-lg font-semibold">Dataset tasks</h2><p className="mt-1 text-sm text-slate-500">Only approved tasks can be added.</p></CardHeader><CardContent>{dataset.items.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">This dataset is empty.</p> : <div className="divide-y divide-slate-100">{dataset.items.map(({ task }) => <div key={task.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><Link href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">{task.title}</Link><p className="mt-1 text-xs text-slate-500">{label(task.difficulty)} · {label(task.verifierType)}</p></div><Badge>{task.status}</Badge><RemoveDatasetTask datasetId={datasetId} taskId={task.id} /></div>)}</div>}</CardContent></Card>

    <Card><CardHeader><h2 className="text-lg font-semibold">Add approved tasks</h2></CardHeader><CardContent><AddDatasetTasks datasetId={datasetId} tasks={eligibleTasks} /></CardContent></Card>

    <Card><CardHeader><h2 className="text-lg font-semibold">Releases</h2><p className="mt-1 text-sm text-slate-500">Immutable semantic versions with deterministic splits.</p></CardHeader><CardContent>{dataset.releases.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No releases yet.</p> : <div className="divide-y divide-slate-100">{dataset.releases.map((release) => <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={release.id}><div><Link className="font-semibold text-indigo-700 hover:underline" href={`/dashboard/datasets/${dataset.id}/releases/${release.id}`}>Release {release.version}</Link><p className="mt-1 text-xs text-slate-500">{release.totalCount} tasks · {release.trainCount}/{release.validationCount}/{release.testCount} train/validation/test</p></div><time className="text-xs text-slate-400">{release.createdAt.toLocaleString()}</time></div>)}</div>}</CardContent></Card>

    <Card><CardHeader><h2 className="text-lg font-semibold">Immutable versions</h2><p className="mt-1 text-sm text-slate-500">Snapshots retain their task data even if the source tasks change.</p></CardHeader><CardContent>{dataset.versions.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No snapshots yet.</p> : <div className="divide-y divide-slate-100">{dataset.versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold text-slate-900">Version {version.version}</p><p className="mt-1 text-xs text-slate-500">{version.name} · {Array.isArray(version.items) ? version.items.length : 0} tasks</p></div><time className="text-xs text-slate-400">{version.createdAt.toLocaleString()}</time></div>)}</div>}</CardContent></Card>
  </div>;
}

function CountCard({ title, values }: { title: string; values: [string, number][] }) {
  return <Card><CardHeader><h2 className="font-semibold">{title}</h2></CardHeader><CardContent className="grid grid-cols-3 gap-3">{values.map(([name, count]) => <div key={name} className="rounded-lg bg-slate-50 p-3 text-center"><strong className="block text-xl text-slate-900">{count}</strong><span className="text-xs text-slate-500">{name}</span></div>)}</CardContent></Card>;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
