import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/task-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDemoRole } from "@/lib/demo-role";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";
import type { TaskInput } from "@/lib/validation";

export default async function EditTaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const [task, role] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, projectId }, include: { verifierVersions: { orderBy: { version: "desc" }, take: 1 } } }),
    getDemoRole(),
  ]);
  if (!task) notFound();
  if (!can(role, "EDIT_TASK")) return <Card><CardContent className="py-12 text-center"><h1 className="text-xl font-semibold">Author access required</h1><p className="mt-2 text-sm text-slate-500">Switch to Author or Admin to edit tasks.</p></CardContent></Card>;
  const activeVerifier = task.verifierVersions[0];
  if (!activeVerifier) notFound();
  const config = activeVerifier.verifierConfig && typeof activeVerifier.verifierConfig === "object" && !Array.isArray(activeVerifier.verifierConfig) ? activeVerifier.verifierConfig : {};
  const tags = Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "";
  const initialValues: TaskInput = {
    title: task.title,
    prompt: task.prompt,
    verifierType: activeVerifier.verifierType,
    difficulty: task.difficulty,
    status: task.status,
    tags,
    expectedText: typeof config.expected === "string" ? config.expected : "",
    expectedNumber: typeof config.expected === "number" ? String(config.expected) : "",
    tolerance: typeof config.tolerance === "number" ? String(config.tolerance) : "0",
    pattern: typeof config.pattern === "string" ? config.pattern : "",
    flags: typeof config.flags === "string" ? config.flags : "",
    jsonSchema: activeVerifier.verifierType === "JSON_SCHEMA" ? JSON.stringify(config.schema, null, 2) : "",
    changeSummary: "",
  };

  return <div className="mx-auto max-w-3xl"><Link href={`/dashboard/projects/${projectId}/tasks/${taskId}`} className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />Back to task</Link><Card><CardHeader><h1 className="text-2xl font-bold text-slate-950">Edit task</h1><p className="mt-1 text-sm text-slate-500">Update task content and verifier settings.</p></CardHeader><CardContent><TaskForm projectId={projectId} taskId={taskId} initialValues={initialValues} /></CardContent></Card></div>;
}
