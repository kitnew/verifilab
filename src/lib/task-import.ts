import Papa from "papaparse";
import { z } from "zod";
import { generationFingerprint } from "@/lib/generation";
import { normalizeVerifierSnapshot } from "@/lib/verifier-version";
import { storedVerifierSchema, taskSchema, toTaskData } from "@/lib/validation";

export const MAX_TASK_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_TASK_IMPORT_ROWS = 500;
export const taskImportFormats = ["CSV", "JSON", "JSONL"] as const;
export type TaskImportFormat = (typeof taskImportFormats)[number];
export type DuplicateStrategy = "SKIP" | "IMPORT";

export type ImportedTask = {
  title: string;
  prompt: string;
  verifierType: "EXACT_MATCH" | "NUMERIC" | "REGEX" | "JSON_SCHEMA";
  verifierConfig: Record<string, unknown>;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
};
export type TaskImportIssue = { rowNumber: number; errors: string[]; raw: string };
export type TaskImportRow = { rowNumber: number; task?: ImportedTask; errors: string[]; duplicate: boolean; raw: string };
export type TaskImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: TaskImportRow[];
  error?: string;
};
type FingerprintTask = Pick<ImportedTask, "title" | "prompt" | "verifierType"> & { verifierConfig: unknown };

const canonicalRowSchema = z.object({
  title: z.string(),
  prompt: z.string(),
  verifierType: z.enum(["EXACT_MATCH", "NUMERIC", "REGEX", "JSON_SCHEMA"]),
  verifierConfig: z.unknown(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.union([z.array(z.string()), z.string()]),
});

export function taskImportFormat(filename: string): TaskImportFormat | undefined {
  const extension = filename.toLowerCase().split(".").pop();
  return extension === "csv" ? "CSV" : extension === "json" ? "JSON" : extension === "jsonl" ? "JSONL" : undefined;
}

export function parseTaskImport(content: string, format: TaskImportFormat, existingTasks: FingerprintTask[] = []): TaskImportPreview {
  if (new TextEncoder().encode(content).byteLength > MAX_TASK_IMPORT_BYTES) return empty(`File exceeds ${MAX_TASK_IMPORT_BYTES} bytes.`);
  const parsed = format === "CSV" ? csvRows(content) : format === "JSON" ? jsonRows(content) : jsonlRows(content);
  if ("error" in parsed) return empty(parsed.error);
  if (parsed.rows.length > MAX_TASK_IMPORT_ROWS) return empty(`Maximum import size is ${MAX_TASK_IMPORT_ROWS} rows.`);

  const seen = new Set(existingTasks.flatMap((task) => {
    try { return [taskFingerprint(task)]; } catch { return []; }
  }));
  const rows = parsed.rows.map(({ rowNumber, value, raw, errors }) => {
    if (errors) return { rowNumber, errors, duplicate: false, raw: raw.slice(0, 500) };
    const validated = validateTaskImportRow(value);
    if (!validated.success) return { rowNumber, errors: validated.errors, duplicate: false, raw: raw.slice(0, 500) };
    const fingerprint = taskFingerprint(validated.task);
    const duplicate = seen.has(fingerprint);
    seen.add(fingerprint);
    return { rowNumber, task: validated.task, errors: [], duplicate, raw: raw.slice(0, 500) };
  });
  return summarize(rows);
}

export function planTaskImport(preview: TaskImportPreview, strategy: DuplicateStrategy) {
  const tasks = preview.rows.filter((row): row is TaskImportRow & { task: ImportedTask } => Boolean(row.task) && (strategy === "IMPORT" || !row.duplicate)).map((row) => row.task);
  return {
    tasks,
    counts: {
      total: preview.totalRows,
      imported: tasks.length,
      skipped: strategy === "SKIP" ? preview.duplicateRows : 0,
      duplicate: preview.duplicateRows,
      failed: preview.invalidRows,
    },
  };
}

export function validateTaskImportRow(value: unknown): { success: true; task: ImportedTask } | { success: false; errors: string[] } {
  const canonical = canonicalRowSchema.safeParse(value);
  if (!canonical.success) return failure(canonical.error.issues.map(formatIssue));
  const tags = Array.isArray(canonical.data.tags) ? canonical.data.tags : canonical.data.tags.split(",");
  const verifier = storedVerifierSchema.safeParse({ type: canonical.data.verifierType, config: canonical.data.verifierConfig });
  if (!verifier.success) return failure(verifier.error.issues.map((issue) => `verifierConfig.${issue.path.slice(1).join(".") || "value"}: ${issue.message}`));
  const config = verifier.data.config;
  const verifierFields =
    verifier.data.type === "EXACT_MATCH"
      ? { expectedText: verifier.data.config.expected, expectedNumber: "", tolerance: "0", pattern: "", flags: "", jsonSchema: "" }
      : verifier.data.type === "NUMERIC"
        ? { expectedText: "", expectedNumber: String(verifier.data.config.expected), tolerance: String(verifier.data.config.tolerance), pattern: "", flags: "", jsonSchema: "" }
        : verifier.data.type === "REGEX"
          ? { expectedText: "", expectedNumber: "", tolerance: "0", pattern: verifier.data.config.pattern, flags: verifier.data.config.flags, jsonSchema: "" }
          : { expectedText: "", expectedNumber: "", tolerance: "0", pattern: "", flags: "", jsonSchema: JSON.stringify(verifier.data.config.schema) };
  const input = {
    title: canonical.data.title,
    prompt: canonical.data.prompt,
    verifierType: verifier.data.type,
    difficulty: canonical.data.difficulty,
    status: "DRAFT" as const,
    tags: tags.join(","),
    ...verifierFields,
  };
  const task = taskSchema.safeParse(input);
  if (!task.success) return failure(task.error.issues.map(formatIssue));
  const verifierConfig = normalizeVerifierSnapshot({ verifierType: verifier.data.type, verifierConfig: config }).verifierConfig;
  if (!isRecord(verifierConfig)) return failure(["verifierConfig.value: Verifier configuration must be an object."]);
  return { success: true, task: { ...toTaskData(task.data), verifierConfig } };
}

export function taskFingerprint(task: FingerprintTask) {
  const normalized = normalizeVerifierSnapshot(task);
  if (!isRecord(normalized.verifierConfig)) throw new Error("Verifier configuration must be an object.");
  return generationFingerprint({ ...task, verifierConfig: normalized.verifierConfig });
}

function csvRows(content: string): { rows: RawRow[] } | { error: string } {
  const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: "greedy" });
  const required = ["title", "prompt", "verifierType", "verifierConfig", "difficulty", "tags"];
  const missing = required.filter((field) => !parsed.meta.fields?.includes(field));
  if (missing.length) return { error: `CSV is missing required header(s): ${missing.join(", ")}.` };
  const parserErrors = new Map<number, string[]>();
  for (const issue of parsed.errors) {
    const rowNumber = (issue.row ?? 0) + 2;
    parserErrors.set(rowNumber, [...(parserErrors.get(rowNumber) ?? []), issue.message]);
  }
  return { rows: parsed.data.map((row, index) => {
    const rowNumber = index + 2;
    const errors = parserErrors.get(rowNumber);
    if (errors?.length) return { rowNumber, value: row, raw: JSON.stringify(row), errors };
    let verifierConfig: unknown = row.verifierConfig;
    try { verifierConfig = JSON.parse(row.verifierConfig); } catch { verifierConfig = undefined; }
    return { rowNumber, value: { ...row, verifierConfig }, raw: JSON.stringify(row) };
  }) };
}

function jsonRows(content: string): { rows: RawRow[] } | { error: string } {
  try {
    const value: unknown = JSON.parse(content);
    if (!Array.isArray(value)) return { error: "JSON file must contain an array of task objects." };
    return { rows: value.map((item, index) => ({ rowNumber: index + 1, value: item, raw: JSON.stringify(item) })) };
  } catch { return { error: "Malformed JSON file." }; }
}

function jsonlRows(content: string): { rows: RawRow[] } | { error: string } {
  const rows: RawRow[] = [];
  content.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    try { rows.push({ rowNumber: index + 1, value: JSON.parse(raw), raw }); }
    catch { rows.push({ rowNumber: index + 1, value: undefined, raw, errors: ["Malformed JSON."] }); }
  });
  return { rows };
}

function summarize(rows: TaskImportRow[]): TaskImportPreview {
  const validRows = rows.filter((row) => row.task).length;
  return { totalRows: rows.length, validRows, invalidRows: rows.length - validRows, duplicateRows: rows.filter((row) => row.duplicate).length, rows };
}

function failure(errors: string[]) { return { success: false as const, errors }; }
function formatIssue(issue: z.core.$ZodIssue) { return `${issue.path.join(".") || "row"}: ${issue.message}`; }
function empty(error: string): TaskImportPreview { return { totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0, rows: [], error }; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
type RawRow = { rowNumber: number; value: unknown; raw: string; errors?: string[] };
