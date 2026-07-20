"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_EVALUATION_FILE_BYTES, MAX_EVALUATION_RESPONSES, type EvaluationCandidate } from "@/lib/evaluation";

export type ImportState = { candidates: EvaluationCandidate[]; invalidCount: number; fingerprint?: string };
type Preview = { valid: EvaluationCandidate[]; invalid: { line: number; error: string; raw: string }[]; totalRows: number; duplicateCount: number; fingerprint: string; error?: string };

export function CandidateResponseEditor({ sourceType, value, onChange }: { sourceType: string; value: ImportState; onChange: (state: ImportState) => void }) {
  if (sourceType === "MANUAL") return <ManualEditor value={value} onChange={onChange} />;
  if (sourceType === "BULK_TEXT") return <BulkEditor value={value} onChange={onChange} />;
  return <FileEditor format={sourceType as "JSONL" | "CSV"} value={value} onChange={onChange} />;
}

function ManualEditor({ value, onChange }: { value: ImportState; onChange: (state: ImportState) => void }) {
  const candidates = value.candidates.length ? value.candidates : [{ response: "" }];
  function update(index: number, response: string) { onChange({ candidates: candidates.map((candidate, position) => position === index ? { ...candidate, response } : candidate), invalidCount: 0 }); }
  function move(index: number, direction: -1 | 1) { const next = [...candidates]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange({ candidates: next, invalidCount: 0 }); }
  return <div className="space-y-3"><p className="text-sm text-slate-500">Add, edit, duplicate, reorder, or remove candidate responses.</p>{candidates.map((candidate, index) => <div className="rounded-lg border border-slate-200 p-3" key={index}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Response {index + 1}</span><div className="flex gap-1"><Button aria-label="Move response up" size="sm" variant="ghost" onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button><Button aria-label="Move response down" size="sm" variant="ghost" onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button><Button aria-label="Duplicate response" size="sm" variant="ghost" disabled={candidates.length >= MAX_EVALUATION_RESPONSES} onClick={() => onChange({ candidates: [...candidates.slice(0, index + 1), { ...candidate }, ...candidates.slice(index + 1)], invalidCount: 0 })}><Copy className="size-4" /></Button><Button aria-label="Delete response" size="sm" variant="ghost" onClick={() => onChange({ candidates: candidates.filter((_, position) => position !== index), invalidCount: 0 })}><Trash2 className="size-4" /></Button></div></div><Textarea className="min-h-24 font-mono" maxLength={10_000} value={candidate.response} onChange={(event) => update(index, event.target.value)} /></div>)}<Button variant="secondary" disabled={candidates.length >= MAX_EVALUATION_RESPONSES} onClick={() => onChange({ candidates: [...candidates, { response: "" }], invalidCount: 0 })}><Plus className="mr-2 size-4" />Add response</Button></div>;
}

function BulkEditor({ value, onChange }: { value: ImportState; onChange: (state: ImportState) => void }) {
  const [text, setText] = useState(value.candidates.map((candidate) => candidate.response).join("\n"));
  const detected = useMemo(() => text.split(/\r?\n/).filter((line) => line.trim()).length, [text]);
  return <div className="space-y-3"><div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Each non-empty line becomes one response. Use JSONL for responses containing line breaks.</div><Textarea className="min-h-64 font-mono" value={text} onChange={(event) => setText(event.target.value)} placeholder={"126\n124\nThe answer is 126."} /><p className="text-sm text-slate-500">Detected: {detected} response(s)</p><Button variant="secondary" disabled={!detected || detected > MAX_EVALUATION_RESPONSES} onClick={() => onChange({ candidates: text.split(/\r?\n/).filter((line) => line.trim()).map((response) => ({ response })), invalidCount: 0 })}>Preview {detected} responses</Button>{value.candidates.length > 0 && <p className="text-sm font-medium text-emerald-700">{value.candidates.length} responses ready to import.</p>}</div>;
}

function FileEditor({ format, value, onChange }: { format: "JSONL" | "CSV"; value: ImportState; onChange: (state: ImportState) => void }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function upload() {
    if (!file) return;
    if (file.size > MAX_EVALUATION_FILE_BYTES) return setError(`File exceeds ${MAX_EVALUATION_FILE_BYTES} bytes.`);
    setPending(true); setError("");
    const form = new FormData(); form.set("file", file); form.set("format", format);
    try { const response = await fetch("/api/evaluations/import", { method: "POST", body: form }); const data = await response.json() as Preview; if (!response.ok) setError(data.error ?? "Import failed."); else { setPreview(data); onChange({ candidates: data.valid, invalidCount: data.invalid.length, fingerprint: data.fingerprint }); } } catch { setError("Could not preview the import file."); } finally { setPending(false); }
  }
  return <div className="space-y-3"><input accept={format === "JSONL" ? ".jsonl,application/x-ndjson" : ".csv,text/csv"} type="file" onChange={(event) => { setFile(event.target.files?.[0]); setPreview(undefined); onChange({ candidates: [], invalidCount: 0 }); }} /><p className="text-xs text-slate-500">UTF-8 · maximum {Math.round(MAX_EVALUATION_FILE_BYTES / 1024 / 1024)} MB · {MAX_EVALUATION_RESPONSES} responses</p><Button variant="secondary" disabled={!file || pending} onClick={upload}><Upload className="mr-2 size-4" />{pending ? "Validating…" : `Preview ${format}`}</Button>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}{preview && <div className="rounded-lg border border-slate-200 p-4 text-sm"><p><strong>{preview.valid.length}</strong> valid · <strong>{preview.invalid.length}</strong> invalid · <strong>{preview.duplicateCount}</strong> duplicate(s)</p>{preview.invalid.length > 0 && <div className="mt-3 max-h-48 overflow-auto"><p className="font-semibold text-red-700">Invalid rows excluded:</p><ul className="mt-1 space-y-1 text-xs text-red-700">{preview.invalid.map((issue) => <li key={`${issue.line}-${issue.raw}`}>Line {issue.line}: {issue.error}</li>)}</ul></div>}<p className="mt-3 font-medium text-emerald-700">Valid rows are ready to import.</p></div>}{value.candidates.length > 0 && !preview && <p>{value.candidates.length} responses ready.</p>}</div>;
}
