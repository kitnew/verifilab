import Link from "next/link";
import { EvaluationBatchForm } from "@/components/evaluation-batch-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function NewEvaluationPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  const tasks = await prisma.task.findMany({ select: { id: true, title: true, project: { select: { name: true } } }, orderBy: { updatedAt: "desc" } });
  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">Rollout Evaluation Lab</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">New evaluation batch</h1><p className="mt-2 text-slate-500">Import candidate model responses and evaluate them with an immutable task verifier snapshot.</p></div>{tasks.length ? <EvaluationBatchForm tasks={tasks.map((item) => ({ id: item.id, title: item.title, project: item.project.name }))} initialTaskId={task} /> : <Card className="border-dashed"><CardContent className="py-16 text-center"><h2 className="font-semibold">No tasks available</h2><p className="mt-1 text-sm text-slate-500">Create a task before starting an evaluation.</p><Link className={buttonVariants({ className: "mt-5" })} href="/dashboard">View projects</Link></CardContent></Card>}</div>;
}
