import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { AuditTimeline } from "@/components/audit-timeline";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { DuplicateTaskButton } from "@/components/duplicate-task-button";
import { ReviewControls } from "@/components/review-controls";
import { VerificationPlayground } from "@/components/verification-playground";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDemoRole } from "@/lib/demo-role";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";
import { storedVerifierSchema } from "@/lib/validation";

export default async function TaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const [task, role] = await Promise.all([
    prisma.task.findFirst({
      where: { id: taskId, projectId },
      include: {
        project: { select: { name: true } },
        verificationRuns: { orderBy: { createdAt: "desc" }, take: 10 },
        reviewComments: { orderBy: { createdAt: "desc" } },
        auditEvents: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    }),
    getDemoRole(),
  ]);
  if (!task) notFound();
  const tags = Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const verifierValid = storedVerifierSchema.safeParse({ type: task.verifierType, config: task.verifierConfig }).success;

  return (
    <div className="space-y-7">
      <Link href={`/dashboard/projects/${projectId}`} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"><ChevronLeft className="mr-1 size-4" />{task.project.name}</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><div className="mb-3 flex flex-wrap items-center gap-2"><Badge>{task.status}</Badge><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label(task.difficulty)}</span></div><h1 className="text-3xl font-bold tracking-tight text-slate-950">{task.title}</h1><p className="mt-2 text-sm text-slate-500">Updated {task.updatedAt.toLocaleString()}</p></div>
        <div className="flex gap-2">{can(role, "CREATE_TASK") && <DuplicateTaskButton taskId={taskId} />}{can(role, "EDIT_TASK") && <Link href={`/dashboard/projects/${projectId}/tasks/${taskId}/edit`} className={buttonVariants({ variant: "secondary" })}><Pencil className="mr-2 size-4" />Edit task</Link>}</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card><CardHeader><h2 className="font-semibold text-slate-950">Prompt</h2></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{task.prompt}</p></CardContent></Card>
        <div className="space-y-5">
          <Card><CardHeader><h2 className="font-semibold text-slate-950">Verifier</h2></CardHeader><CardContent><p className="mb-3 text-sm font-medium text-indigo-700">{label(task.verifierType)}</p><pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(task.verifierConfig, null, 2)}</pre></CardContent></Card>
          <Card><CardHeader><h2 className="font-semibold text-slate-950">Tags</h2></CardHeader><CardContent className="flex flex-wrap gap-2">{tags.length ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-sm text-slate-400">No tags</span>}</CardContent></Card>
        </div>
      </div>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-slate-950">Review workflow</h2><p className="mt-1 text-sm text-slate-500">Actions are enforced for the current demo role: {role[0]}{role.slice(1).toLowerCase()}.</p></CardHeader>
        <CardContent><ReviewControls taskId={taskId} status={task.status} role={role} /></CardContent>
      </Card>

      <Card><CardHeader><h2 className="text-lg font-semibold text-slate-950">Task activity</h2><p className="mt-1 text-sm text-slate-500">Latest 50 audit events for this task.</p></CardHeader><CardContent><AuditTimeline events={task.auditEvents} /></CardContent></Card>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-slate-950">Review comments</h2><p className="mt-1 text-sm text-slate-500">Reviewer feedback and rejection reasons.</p></CardHeader>
        <CardContent>
          {task.reviewComments.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No review comments yet.</p> : (
            <ol className="space-y-5 border-l border-slate-200 pl-5">{task.reviewComments.map((comment) => <li key={comment.id} className="relative"><span className="absolute -left-[25px] top-1 size-2 rounded-full bg-indigo-500 ring-4 ring-white" /><div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm text-slate-900">{comment.author}</strong><time className="text-xs text-slate-400">{comment.createdAt.toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{comment.body}</p></li>)}</ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-slate-950">Verification playground</h2><p className="mt-1 text-sm text-slate-500">Test a candidate response against this task&apos;s verifier.</p></CardHeader>
        <CardContent><VerificationPlayground taskId={taskId} disabled={!verifierValid} /></CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-slate-950">Recent verification runs</h2><p className="mt-1 text-sm text-slate-500">Latest 10 results for this task.</p></CardHeader>
        <CardContent>
          {task.verificationRuns.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No verification runs yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-semibold">Result</th><th className="pb-3 font-semibold">Candidate</th><th className="pb-3 font-semibold">Reward</th><th className="pb-3 font-semibold">Time</th><th className="pb-3 font-semibold">Run at</th></tr></thead><tbody className="divide-y divide-slate-100">{task.verificationRuns.map((run) => {
              const details = jsonObject(run.details);
              return <tr key={run.id}><td className="py-4 pr-4"><span className={run.passed ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{run.passed ? "PASS" : "FAIL"}</span><p className="mt-1 max-w-sm text-xs text-slate-500">{stringValue(details.details)}</p></td><td className="max-w-xs truncate py-4 pr-4 font-mono text-xs text-slate-700" title={run.candidate}>{run.candidate || "(empty)"}</td><td className="py-4 pr-4 font-medium">{run.passed ? 1 : 0}</td><td className="whitespace-nowrap py-4 pr-4 text-slate-500">{numberValue(details.executionTimeMs).toFixed(3)} ms</td><td className="whitespace-nowrap py-4 text-slate-500">{run.createdAt.toLocaleString()}</td></tr>;
            })}</tbody></table></div>
          )}
        </CardContent>
      </Card>

      {can(role, "DELETE_TASK") && <div className="flex justify-end border-t border-slate-200 pt-6"><DeleteTaskButton taskId={taskId} projectId={projectId} /></div>}
    </div>
  );
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "No details available.";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
