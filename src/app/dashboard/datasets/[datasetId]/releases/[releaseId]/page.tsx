import Link from "next/link";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function DatasetReleasePage({ params }: { params: Promise<{ datasetId: string; releaseId: string }> }) {
  const { datasetId, releaseId } = await params;
  const release = await prisma.datasetRelease.findFirst({ where: { id: releaseId, datasetId }, include: { dataset: { select: { name: true, project: { select: { name: true } } } } } });
  if (!release) notFound();
  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><Link className="text-sm font-medium text-slate-500 hover:text-indigo-600" href={`/dashboard/datasets/${datasetId}`}>← {release.dataset.name}</Link><p className="mt-4 text-sm font-semibold text-indigo-600">{release.dataset.project.name}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Release {release.version}</h1><p className="mt-2 text-slate-500">Created {release.createdAt.toLocaleString()} · seed {release.seed}</p></div><div className="flex flex-wrap gap-2">{(["all", "train", "validation", "test"] as const).map((scope) => <Link className={buttonVariants({ variant: scope === "all" ? "default" : "secondary" })} href={`/api/dataset-releases/${release.id}/export?split=${scope}`} key={scope}><Download className="mr-2 size-4" />{scope === "all" ? "Full release" : label(scope)}</Link>)}</div></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Count label="Total tasks" value={release.totalCount} /><Count label={`Train · ${release.trainPercentage}%`} value={release.trainCount} /><Count label={`Validation · ${release.validationPercentage}%`} value={release.validationCount} /><Count label={`Test · ${release.testPercentage}%`} value={release.testCount} /></div>
    <Card><CardContent className="py-6"><h2 className="font-semibold">Release notes</h2><p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{release.notes || "No release notes."}</p></CardContent></Card>
    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">This release is read-only. Its task and verifier data were snapshotted when the release was created.</p>
  </div>;
}

function Count({ label: text, value }: { label: string; value: number }) { return <Card><CardContent className="py-5"><p className="text-xs font-semibold uppercase text-slate-500">{text}</p><p className="mt-2 text-3xl font-bold">{value}</p></CardContent></Card>; }
function label(value: string) { return value.replace(/^./, (character) => character.toUpperCase()); }
