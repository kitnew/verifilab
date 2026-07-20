"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelGenerationJob, persistGeneratedTasks, previewGeneration, type PreviewTask } from "@/app/generation-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generatorTypes, MAX_BATCH_SIZE } from "@/lib/generation";

type ProjectOption = { id: string; name: string };
const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function GenerationStudio({ projects, initialJobId, initialTasks = [] }: { projects: ProjectOption[]; initialJobId?: string; initialTasks?: PreviewTask[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [generatorType, setGeneratorType] = useState<(typeof generatorTypes)[number]>("ARITHMETIC");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [seed, setSeed] = useState("verifilab-1");
  const [jobId, setJobId] = useState(initialJobId);
  const [tasks, setTasks] = useState(initialTasks);
  const [selected, setSelected] = useState(() => new Set(initialTasks.filter((task) => !task.duplicate).map((task) => task.index)));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [pending, startTransition] = useTransition();

  function preview() {
    setError(""); setMessage(""); setCancelled(false);
    startTransition(async () => {
      const result = await previewGeneration({ projectId, generatorType, count, difficulty, seed });
      if (result.error || !result.jobId || !result.tasks) return setError(result.error ?? "Generation failed.");
      setJobId(result.jobId);
      setTasks(result.tasks);
      setSelected(new Set(result.tasks.filter((task) => !task.duplicate).map((task) => task.index)));
    });
  }

  function save() {
    if (!jobId) return;
    const saving = new Set(selected);
    setError(""); setMessage("");
    startTransition(async () => {
      const result = await persistGeneratedTasks({ jobId, indices: [...selected] });
      if (result.error) return setError(result.error);
      setMessage(`${result.created ?? 0} draft task(s) created.${result.duplicates?.length ? ` ${result.duplicates.length} duplicate(s) skipped.` : ""}`);
      setSelected(new Set());
      setTasks((current) => current.map((task) => saving.has(task.index) ? { ...task, duplicate: true } : task));
      router.refresh();
    });
  }

  function cancel() {
    if (!jobId) return;
    setError(""); setMessage("");
    startTransition(async () => {
      const result = await cancelGenerationJob(jobId);
      if (result.error) return setError(result.error);
      setCancelled(true); setSelected(new Set()); setMessage("Preview cancelled.");
    });
  }

  function toggle(index: number) {
    setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  }

  return <div className="space-y-6">
    <Card><CardHeader><h2 className="text-lg font-semibold text-slate-950">Generation settings</h2><p className="mt-1 text-sm text-slate-500">Same template version and seed produce the same task content.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Field label="Project"><select className={selectClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <Field label="Template"><select className={selectClass} value={generatorType} onChange={(event) => setGeneratorType(event.target.value as typeof generatorType)}>{generatorTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></Field>
      <Field label="Count"><Input min={1} max={MAX_BATCH_SIZE} type="number" value={count} onChange={(event) => setCount(Number(event.target.value))} /></Field>
      <Field label="Difficulty"><select className={selectClass} value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></Field>
      <Field label="Seed"><Input maxLength={100} value={seed} onChange={(event) => setSeed(event.target.value)} /></Field>
      <div className="flex items-center gap-2 md:col-span-2 lg:col-span-5"><Button disabled={pending || !projectId} onClick={preview}>{pending && tasks.length === 0 ? "Generating…" : "Generate preview"}</Button><Link className={buttonVariants({ variant: "secondary" })} href="/dashboard/generation/history">View history</Link></div>
    </CardContent></Card>

    {pending && <Card><CardContent className="py-8"><p className="mb-2 text-sm font-medium text-slate-700">Generating deterministic tasks…</p><progress className="h-2 w-full accent-indigo-600" max="100" value="50">50%</progress></CardContent></Card>}
    {(error || message) && <p aria-live="polite" className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}

    {!pending && tasks.length === 0 ? <Card className="border-dashed"><CardContent className="py-16 text-center"><h2 className="font-semibold text-slate-900">No preview yet</h2><p className="mt-1 text-sm text-slate-500">Choose settings and generate up to {MAX_BATCH_SIZE} draft candidates.</p></CardContent></Card> : tasks.length > 0 && <Card className="overflow-hidden"><CardHeader className="flex-row items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-950">Preview</h2><p className="mt-1 text-sm text-slate-500">{tasks.length} generated · {tasks.filter((task) => task.duplicate).length} duplicate(s)</p></div><div className="flex gap-2"><Button variant="secondary" disabled={pending || cancelled || !jobId} onClick={cancel}>Cancel</Button><Button disabled={pending || cancelled || selected.size === 0} onClick={save}>Save {selected.size} as drafts</Button></div></CardHeader>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3"><input aria-label="Select all non-duplicate tasks" type="checkbox" checked={selected.size > 0 && selected.size === tasks.filter((task) => !task.duplicate).length} onChange={() => setSelected(selected.size ? new Set() : new Set(tasks.filter((task) => !task.duplicate).map((task) => task.index)))} /></th><th className="px-5 py-3">Task</th><th className="px-5 py-3">Verifier</th><th className="px-5 py-3">Expected</th><th className="px-5 py-3">State</th></tr></thead><tbody className="divide-y divide-slate-100">{tasks.map((task) => <tr key={task.index}><td className="px-5 py-4"><input aria-label={`Select ${task.title}`} type="checkbox" disabled={task.duplicate || cancelled} checked={selected.has(task.index)} onChange={() => toggle(task.index)} /></td><td className="max-w-xl px-5 py-4"><p className="font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{task.prompt}</p></td><td className="whitespace-nowrap px-5 py-4 text-slate-600">{label(task.verifierType)}</td><td className="max-w-56 truncate px-5 py-4 font-mono text-xs text-slate-600" title={task.expectedAnswer}>{task.expectedAnswer}</td><td className="px-5 py-4">{task.duplicate ? <Badge>Duplicate</Badge> : <span className="text-emerald-700">Ready</span>}</td></tr>)}</tbody></table></div>
    </Card>}
  </div>;
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{text}</Label>{children}</div>;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
