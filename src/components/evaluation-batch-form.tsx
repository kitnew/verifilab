"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvaluationBatch } from "@/app/evaluation-actions";
import { CandidateResponseEditor, type ImportState } from "@/components/candidate-response-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { duplicateResponseCount, evaluationSourceTypes } from "@/lib/evaluation";

type TaskOption = { id: string; title: string; project: string };
const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function EvaluationBatchForm({ tasks, initialTaskId }: { tasks: TaskOption[]; initialTaskId?: string }) {
  const router = useRouter();
  const [taskId, setTaskId] = useState(initialTaskId && tasks.some((task) => task.id === initialTaskId) ? initialTaskId : tasks[0]?.id ?? "");
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [sourceType, setSourceType] = useState<(typeof evaluationSourceTypes)[number]>("MANUAL");
  const [modelName, setModelName] = useState(""); const [modelVersion, setModelVersion] = useState(""); const [temperature, setTemperature] = useState(""); const [topP, setTopP] = useState(""); const [seed, setSeed] = useState("");
  const [importState, setImportState] = useState<ImportState>({ candidates: [{ response: "" }], invalidCount: 0 });
  const [removeDuplicates, setRemoveDuplicates] = useState(false); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const candidates = importState.candidates.filter((candidate) => candidate.response.length > 0);
  const duplicates = useMemo(() => duplicateResponseCount(candidates), [candidates]);
  function changeSource(next: typeof sourceType) { setSourceType(next); setImportState({ candidates: next === "MANUAL" ? [{ response: "" }] : [], invalidCount: 0 }); }
  function submit() { setError(""); startTransition(async () => { const result = await createEvaluationBatch({ taskId, name, description, sourceType, modelName, modelVersion, temperature: number(temperature), topP: number(topP), seed: integer(seed), candidates, invalidCount: importState.invalidCount, importFingerprint: importState.fingerprint, removeDuplicates }); if (result.error || !result.batchId) return setError(result.error ?? "Could not create the batch."); router.push(`/dashboard/evaluations/${result.batchId}`); }); }

  return <div className="space-y-6"><Card><CardHeader><h2 className="text-lg font-semibold">Batch metadata</h2></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Task"><select className={selectClass} value={taskId} onChange={(event) => setTaskId(event.target.value)}>{tasks.map((task) => <option key={task.id} value={task.id}>{task.project} · {task.title}</option>)}</select></Field><Field label="Batch name"><Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Model calibration run" /></Field><Field className="md:col-span-2" label="Description"><Textarea maxLength={1_000} value={description} onChange={(event) => setDescription(event.target.value)} /></Field><Field label="Model name"><Input maxLength={120} value={modelName} onChange={(event) => setModelName(event.target.value)} /></Field><Field label="Model version"><Input maxLength={120} value={modelVersion} onChange={(event) => setModelVersion(event.target.value)} /></Field><Field label="Temperature (0–2)"><Input min="0" max="2" step="any" type="number" value={temperature} onChange={(event) => setTemperature(event.target.value)} /></Field><Field label="Top-p (0–1)"><Input min="0" max="1" step="any" type="number" value={topP} onChange={(event) => setTopP(event.target.value)} /></Field><Field label="Seed"><Input step="1" type="number" value={seed} onChange={(event) => setSeed(event.target.value)} /></Field></CardContent></Card>
    <Card><CardHeader><h2 className="text-lg font-semibold">Candidate responses</h2><div className="mt-3 flex flex-wrap gap-2">{evaluationSourceTypes.map((source) => <Button key={source} size="sm" variant={sourceType === source ? "default" : "secondary"} onClick={() => changeSource(source)}>{label(source)}</Button>)}</div></CardHeader><CardContent><CandidateResponseEditor sourceType={sourceType} value={importState} onChange={setImportState} /></CardContent></Card>
    <Card><CardContent className="py-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-900">{candidates.length} valid response(s) · {importState.invalidCount} invalid · {duplicates} duplicate(s)</p><label className="mt-2 flex items-center gap-2 text-sm text-slate-600"><input checked={removeDuplicates} type="checkbox" onChange={(event) => setRemoveDuplicates(event.target.checked)} />Remove exact duplicates before saving (default keeps all)</label></div><Button disabled={pending || !name.trim() || candidates.length === 0} onClick={submit}>{pending ? "Creating…" : "Create evaluation batch"}</Button></div>{error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}</CardContent></Card>
  </div>;
}

function Field({ label: text, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <div className={`grid gap-1.5 ${className}`}><Label>{text}</Label>{children}</div>; }
function number(value: string) { return value.trim() ? Number(value) : undefined; }
function integer(value: string) { return value.trim() ? Number(value) : undefined; }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
