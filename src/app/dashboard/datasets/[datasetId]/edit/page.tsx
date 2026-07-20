import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { DatasetForm } from "@/components/dataset-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function EditDatasetPage({ params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset) notFound();
  return <div className="mx-auto max-w-2xl"><Link href={`/dashboard/datasets/${datasetId}`} className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />Back to dataset</Link><Card><CardHeader><h1 className="text-2xl font-bold">Edit dataset</h1></CardHeader><CardContent><DatasetForm projects={[]} dataset={dataset} /></CardContent></Card></div>;
}
