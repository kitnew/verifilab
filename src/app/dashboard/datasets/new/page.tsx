import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DatasetForm } from "@/components/dataset-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function NewDatasetPage() {
  const projects = await prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return <div className="mx-auto max-w-2xl"><Link href="/dashboard/datasets" className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />Datasets</Link><Card><CardHeader><h1 className="text-2xl font-bold">Create dataset</h1><p className="mt-1 text-sm text-slate-500">Datasets can contain approved tasks from one project.</p></CardHeader><CardContent>{projects.length ? <DatasetForm projects={projects} /> : <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Create a project before creating a dataset.</p>}</CardContent></Card></div>;
}
