"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CanonicalTaskImportField, ColumnMapping, DuplicateStrategy, TaskImportPreview } from "@/lib/task-import";

type Project = { id: string; name: string };
type Result = { jobId: string };
const fieldHelp: Record<CanonicalTaskImportField, string> = {
  title: "Task title",
  prompt: "Prompt shown to the model",
  verifierType: "EXACT_MATCH, NUMERIC, REGEX, or JSON_SCHEMA",
  verifierConfig: "JSON object containing verifier settings",
  difficulty: "EASY, MEDIUM, or HARD",
  tags: "Array or comma-separated text",
};

export function TaskImportStudio({ projects, maxBytes, maxRows, fields }: { projects: Project[]; maxBytes: number; maxRows: number; fields: readonly CanonicalTaskImportField[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [file, setFile] = useState<File>();
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [strategy, setStrategy] = useState<DuplicateStrategy>("SKIP");
  const [preview, setPreview] = useState<TaskImportPreview>();
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"inspect" | "preview" | "confirm">();

  async function inspect(nextFile: File) {
    if (nextFile.size > maxBytes) return setError("File exceeds " + maxBytes + " bytes.");
    setPending("inspect"); setError(""); setColumns([]); setMapping(undefined); setPreview(undefined); setResult(undefined);
    const form = new FormData();
    form.set("file", nextFile); form.set("projectId", projectId); form.set("mode", "inspect");
    try {
      const response = await fetch("/api/task-imports", { method: "POST", body: form });
      const data: unknown = await response.json();
      if (!response.ok) return setError(message(data, "Could not inspect columns."));
      if (!isInspection(data)) return setError("The server returned invalid column information.");
      setColumns(data.columns); setMapping(data.mapping);
    } catch { setError("Could not inspect the import file."); }
    finally { setPending(undefined); }
  }

  async function submit(mode: "preview" | "confirm") {
    if (!file || !projectId || !mapping) return;
    setPending(mode); setError(""); setResult(undefined);
    const form = new FormData();
    form.set("file", file);
    form.set("projectId", projectId);
    form.set("mode", mode);
    form.set("mapping", JSON.stringify(mapping));
    form.set("duplicateStrategy", strategy);
    try {
      const response = await fetch("/api/task-imports", { method: "POST", body: form });
      const data: unknown = await response.json();
      if (!response.ok) return setError(message(data, "Import failed."));
      if (mode === "preview" && isPreview(data)) setPreview(data);
      else if (mode === "confirm" && isResult(data)) { setResult(data); setPreview(undefined); router.refresh(); }
      else setError("The server returned an invalid response.");
    } catch { setError("Could not process the import file."); }
    finally { setPending(undefined); }
  }

  function chooseFile(nextFile?: File) {
    setFile(nextFile); setColumns([]); setMapping(undefined); setPreview(undefined); setResult(undefined); setError("");
    if (nextFile && projectId) void inspect(nextFile);
  }

  function mapField(field: CanonicalTaskImportField, column: string) {
    if (!mapping) return;
    setMapping({ ...mapping, [field]: column });
    setPreview(undefined); setResult(undefined);
  }

  const mappingComplete = mapping && fields.every((field) => mapping[field]) && new Set(Object.values(mapping)).size === fields.length;

  return <div className="space-y-6">
    <Card><CardHeader><h2 className="text-lg font-semibold text-slate-950">1. Upload</h2><p className="mt-1 text-sm text-slate-500">Choose a target project and a UTF-8 task file.</p></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Target project"><select value={projectId} onChange={(event) => { setProjectId(event.target.value); chooseFile(file); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><Field label="Task file"><input type="file" accept=".csv,.json,.jsonl,text/csv,application/json,application/x-ndjson" onChange={(event) => chooseFile(event.target.files?.[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium" /></Field></div>
      <p className="text-xs text-slate-500">CSV, JSON array, or JSONL · maximum {Math.round(maxBytes / 1024 / 1024)} MB and {maxRows} rows.</p>
      {pending === "inspect" && <p className="text-sm text-slate-500">Reading source columns…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </CardContent></Card>

    {columns.length > 0 && mapping && <Card><CardHeader><h2 className="text-lg font-semibold text-slate-950">2. Map columns</h2><p className="mt-1 text-sm text-slate-500">Map every required task field. Exact canonical names are selected automatically.</p></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <label key={field} className="space-y-2"><span className="block text-sm font-semibold text-slate-800">{field}</span><span className="block text-xs text-slate-500">{fieldHelp[field]}</span><select value={mapping[field]} onChange={(event) => mapField(field, event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Not mapped</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>)}</div>
      {!mappingComplete && <p role="alert" className="text-sm text-amber-700">Map every field to a different source column before validation.</p>}
      <Button disabled={!mappingComplete || Boolean(pending)} onClick={() => submit("preview")}><Upload className="mr-2 size-4" />{pending === "preview" ? "Validating…" : "3. Validate and preview"}</Button>
    </CardContent></Card>}

    {preview && <Card><CardHeader><h2 className="text-lg font-semibold text-slate-950">4. Preview errors</h2><p className="mt-1 text-sm text-slate-500">Dry run only. No tasks have been persisted.</p></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4"><Metric label="Total" value={preview.totalRows} /><Metric label="Valid" value={preview.validRows} /><Metric label="Invalid" value={preview.invalidRows} /><Metric label="Duplicates" value={preview.duplicateRows} /></div>
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Task</th><th className="px-4 py-3">Result</th></tr></thead><tbody className="divide-y divide-slate-100">{preview.rows.map((row) => <tr key={row.rowNumber}><td className="px-4 py-3 text-slate-500">{row.rowNumber}</td><td className="px-4 py-3"><p className="font-medium text-slate-900">{row.task?.title || "Invalid row"}</p>{row.task && <p className="mt-1 max-w-2xl truncate text-xs text-slate-500">{row.task.prompt}</p>}</td><td className="px-4 py-3">{row.errors.length ? <ul className="space-y-1 text-xs text-red-700">{row.errors.map((item) => <li key={item}>{item}</li>)}</ul> : row.duplicate ? <span className="font-medium text-amber-700">Duplicate</span> : <span className="font-medium text-emerald-700">Valid</span>}</td></tr>)}</tbody></table></div>
      <fieldset className="space-y-2"><legend className="text-sm font-semibold text-slate-900">Duplicate strategy</legend><Strategy value="SKIP" selected={strategy} set={setStrategy} label="Skip duplicates" detail="Keep existing tasks and ignore matching rows." /><Strategy value="REPLACE" selected={strategy} set={setStrategy} label="Replace duplicates" detail="Update matching task fields while preserving review status." /><Strategy value="CREATE_NEW" selected={strategy} set={setStrategy} label="Create new tasks" detail="Import every valid row as a separate DRAFT." /></fieldset>
      <Button disabled={preview.validRows === 0 || Boolean(pending)} onClick={() => submit("confirm")}>{pending === "confirm" ? "Importing…" : "5. Import valid rows"}</Button>
    </CardContent></Card>}

    {result && <Card className="border-emerald-200"><CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /><div><h2 className="font-semibold text-slate-950">Import queued</h2><p className="mt-1 text-sm text-slate-600">Follow validation and import progress in Job Center.</p></div></div><Link href={"/dashboard/jobs/" + result.jobId} className={buttonVariants({ variant: "secondary" })}>View job</Link></CardContent></Card>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-2"><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>; }
function Strategy({ value, selected, set, label, detail }: { value: DuplicateStrategy; selected: DuplicateStrategy; set: (value: DuplicateStrategy) => void; label: string; detail: string }) { return <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="radio" checked={selected === value} onChange={() => set(value)} /><span><strong className="block text-slate-800">{label}</strong><span className="text-xs text-slate-500">{detail}</span></span></label>; }
function message(value: unknown, fallback: string) { return value !== null && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }
function isInspection(value: unknown): value is { columns: string[]; mapping: ColumnMapping } { return value !== null && typeof value === "object" && "columns" in value && Array.isArray(value.columns) && value.columns.every((column: unknown) => typeof column === "string") && "mapping" in value && value.mapping !== null && typeof value.mapping === "object"; }
function isPreview(value: unknown): value is TaskImportPreview { return value !== null && typeof value === "object" && "rows" in value && Array.isArray(value.rows) && "totalRows" in value && typeof value.totalRows === "number"; }
function isResult(value: unknown): value is Result { return value !== null && typeof value === "object" && "jobId" in value && typeof value.jobId === "string"; }
