import Link from "next/link";
import { notFound } from "next/navigation";
import { DatasetReleaseForm } from "@/components/dataset-release-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function NewDatasetReleasePage({ params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { id: true, name: true, _count: { select: { items: true } } } });
  if (!dataset) notFound();
  return <div className="mx-auto max-w-3xl space-y-7"><div><Link className="text-sm font-medium text-slate-500 hover:text-indigo-600" href={`/dashboard/datasets/${dataset.id}`}>← {dataset.name}</Link><h1 className="mt-4 text-3xl font-bold tracking-tight">Create dataset release</h1><p className="mt-2 text-slate-500">Snapshot current tasks and assign deterministic train, validation, and test splits.</p></div><Card><CardHeader><h2 className="text-lg font-semibold">Release configuration</h2></CardHeader><CardContent><DatasetReleaseForm datasetId={dataset.id} taskCount={dataset._count.items} /></CardContent></Card></div>;
}
