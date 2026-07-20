import Papa from "papaparse";
import { z } from "zod";
import { generationFingerprint } from "@/lib/generation";
import { normalizeVerifierSnapshot } from "@/lib/verifier-version";
import { storedVerifierSchema, taskSchema, toTaskData } from "@/lib/validation";

export const MAX_TASK_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_TASK_IMPORT_ROWS = 500;
export const taskImportFormats = ["CSV", "JSON", "JSONL"] as const;
export const canonicalTaskImportFields = ["title", "prompt", "verifierType", "verifierConfig", "difficulty", "tags"] as const;
export type TaskImportFormat = (typeof taskImportFormats)[number];
export type CanonicalTaskImportField = (typeof canonicalTaskImportFields)[number];
export type ColumnMapping = Record<CanonicalTaskImportField, string>;
export type DuplicateStrategy = "SKIP" | "REPLACE" | "CREATE_NEW";

export type ImportedTask = {
  title: string;
  prompt: string;
  verifierType: "EXACT_MATCH" | "NUMERIC" | "REGEX" | "JSON_SCHEMA";
  verifierConfig: Record<string, unknown>;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
};
export type TaskImportRow = {
  rowNumber: number;
  task?: ImportedTask;
  errors: string[];
  duplicate: boolean;
  duplicateTaskId?: string;
  duplicateOfRow?: number;
  raw: string;
};
export type TaskImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: TaskImportRow[];
  error?: string;
};
type FingerprintTask = Pick<ImportedTask, "title" | "prompt" | "verifierType"> & { id?: string; verifierConfig: unknown };
type RawRow = { rowNumber: number; value: unknown; raw: string; errors?: string[] };
type RawRows = { rows: RawRow[]; columns: string[] } | { error: string };

export const columnMappingSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  verifierType: z.string().min(1),
  verifierConfig: z.string().min(1),
  difficulty: z.string().min(1),
  tags: z.string().min(1),
}).superRefine((mapping, ctx) => {
  const values = Object.values(mapping);
  if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Each source column can only be mapped once." });
});

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

export function inspectTaskImport(content: string, format: TaskImportFormat) {
  const limit = importLimit(content);
  if (limit) return { columns: [], error: limit };
  const parsed = rawRows(content, format);
  if ("error" in parsed) return { columns: [], error: parsed.error };
  if (parsed.rows.length > MAX_TASK_IMPORT_ROWS) return { columns: [], error: "Maximum import size is " + MAX_TASK_IMPORT_ROWS + " rows." };
  if (!parsed.columns.length) return { columns: [], error: "No object fields were found in the file." };
  return { columns: parsed.columns, mapping: defaultColumnMapping(parsed.columns) };
}

export function defaultColumnMapping(columns: string[]): ColumnMapping {
  const normalized = new Map(columns.map((column) => [normalizeColumn(column), column]));
  return Object.fromEntries(canonicalTaskImportFields.map((field) => [field, normalized.get(normalizeColumn(field)) ?? ""])) as ColumnMapping;
}

export function parseTaskImport(content: string, format: TaskImportFormat, existingTasks: FingerprintTask[] = [], mapping: ColumnMapping = identityMapping()): TaskImportPreview {
  const limit = importLimit(content);
  if (limit) return empty(limit);
  const validMapping = columnMappingSchema.safeParse(mapping);
  if (!validMapping.success) return empty(validMapping.error.issues[0].message);
  const parsed = rawRows(content, format);
  if ("error" in parsed) return empty(parsed.error);
  if (parsed.rows.length > MAX_TASK_IMPORT_ROWS) return empty("Maximum import size is " + MAX_TASK_IMPORT_ROWS + " rows.");

  const seen = new Map<string, { taskId?: string; rowNumber?: number }>();
  for (const task of existingTasks) {
    try {
      const fingerprint = taskFingerprint(task);
      if (!seen.has(fingerprint)) seen.set(fingerprint, { taskId: task.id });
    } catch { /* Invalid stored verifiers are not duplicate candidates. */ }
  }
  const rows = parsed.rows.map(({ rowNumber, value, raw, errors }) => {
    if (errors) return { rowNumber, errors, duplicate: false, raw: raw.slice(0, 500) };
    const validated = validateTaskImportRow(applyMapping(value, validMapping.data));
    if (!validated.success) return { rowNumber, errors: validated.errors, duplicate: false, raw: raw.slice(0, 500) };
    const fingerprint = taskFingerprint(validated.task);
    const match = seen.get(fingerprint);
    if (!match) seen.set(fingerprint, { rowNumber });
    return { rowNumber, task: validated.task, errors: [], duplicate: Boolean(match), duplicateTaskId: match?.taskId, duplicateOfRow: match?.rowNumber, raw: raw.slice(0, 500) };
  });
  return summarize(rows);
}

export function planTaskImport(preview: TaskImportPreview, strategy: DuplicateStrategy) {
  const valid = preview.rows.filter((row): row is TaskImportRow & { task: ImportedTask } => Boolean(row.task));
  let creates: ImportedTask[] = [];
  const replacements: { taskId: string; task: ImportedTask }[] = [];
  if (strategy === "CREATE_NEW") {
    creates = valid.map((row) => row.task);
  } else if (strategy === "SKIP") {
    creates = valid.filter((row) => !row.duplicate).map((row) => row.task);
  } else {
    const lastByFingerprint = new Map<string, TaskImportRow & { task: ImportedTask }>();
    for (const row of valid) lastByFingerprint.set(taskFingerprint(row.task), row);
    for (const row of lastByFingerprint.values()) {
      if (row.duplicateTaskId) replacements.push({ taskId: row.duplicateTaskId, task: row.task });
      else creates.push(row.task);
    }
  }
  const imported = creates.length + replacements.length;
  return {
    tasks: creates,
    creates,
    replacements,
    counts: {
      total: preview.totalRows,
      imported,
      replaced: replacements.length,
      skipped: strategy === "CREATE_NEW" ? 0 : valid.length - imported,
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
  if (!verifier.success) return failure(verifier.error.issues.map((issue) => "verifierConfig." + (issue.path.slice(1).join(".") || "value") + ": " + issue.message));
  const verifierFields =
    verifier.data.type === "EXACT_MATCH"
      ? { expectedText: verifier.data.config.expected, expectedNumber: "", tolerance: "0", pattern: "", flags: "", jsonSchema: "" }
      : verifier.data.type === "NUMERIC"
        ? { expectedText: "", expectedNumber: String(verifier.data.config.expected), tolerance: String(verifier.data.config.tolerance), pattern: "", flags: "", jsonSchema: "" }
        : verifier.data.type === "REGEX"
          ? { expectedText: "", expectedNumber: "", tolerance: "0", pattern: verifier.data.config.pattern, flags: verifier.data.config.flags, jsonSchema: "" }
          : { expectedText: "", expectedNumber: "", tolerance: "0", pattern: "", flags: "", jsonSchema: JSON.stringify(verifier.data.config.schema) };
  const task = taskSchema.safeParse({
    title: canonical.data.title,
    prompt: canonical.data.prompt,
    verifierType: verifier.data.type,
    difficulty: canonical.data.difficulty,
    status: "DRAFT",
    tags: tags.join(","),
    ...verifierFields,
  });
  if (!task.success) return failure(task.error.issues.map(formatIssue));
  const verifierConfig = normalizeVerifierSnapshot({ verifierType: verifier.data.type, verifierConfig: verifier.data.config }).verifierConfig;
  if (!isRecord(verifierConfig)) return failure(["verifierConfig.value: Verifier configuration must be an object."]);
  return { success: true, task: { ...toTaskData(task.data), verifierConfig } };
}

export function taskFingerprint(task: FingerprintTask) {
  const normalized = normalizeVerifierSnapshot(task);
  if (!isRecord(normalized.verifierConfig)) throw new Error("Verifier configuration must be an object.");
  return generationFingerprint({ ...task, verifierConfig: normalized.verifierConfig });
}

function rawRows(content: string, format: TaskImportFormat): RawRows {
  return format === "CSV" ? csvRows(content) : format === "JSON" ? jsonRows(content) : jsonlRows(content);
}

function csvRows(content: string): RawRows {
  const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: "greedy" });
  if (!parsed.meta.fields?.length) return { error: "CSV must include a header row." };
  const parserErrors = new Map<number, string[]>();
  for (const issue of parsed.errors) {
    const rowNumber = (issue.row ?? 0) + 2;
    parserErrors.set(rowNumber, [...(parserErrors.get(rowNumber) ?? []), issue.message]);
  }
  return {
    columns: parsed.meta.fields,
    rows: parsed.data.map((row, index) => ({
      rowNumber: index + 2,
      value: row,
      raw: JSON.stringify(row),
      errors: parserErrors.get(index + 2),
    })),
  };
}

function jsonRows(content: string): RawRows {
  try {
    const value: unknown = JSON.parse(content);
    if (!Array.isArray(value)) return { error: "JSON file must contain an array of task objects." };
    return withColumns(value.map((item, index) => ({ rowNumber: index + 1, value: item, raw: JSON.stringify(item) })));
  } catch { return { error: "Malformed JSON file." }; }
}

function jsonlRows(content: string): RawRows {
  const rows: RawRow[] = [];
  content.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    try { rows.push({ rowNumber: index + 1, value: JSON.parse(raw), raw }); }
    catch { rows.push({ rowNumber: index + 1, value: undefined, raw, errors: ["Malformed JSON."] }); }
  });
  return withColumns(rows);
}

function withColumns(rows: RawRow[]): RawRows {
  const columns = new Set<string>();
  for (const row of rows) if (isRecord(row.value)) Object.keys(row.value).forEach((key) => columns.add(key));
  return { rows, columns: [...columns] };
}

function applyMapping(value: unknown, mapping: ColumnMapping) {
  if (!isRecord(value)) return value;
  const mapped = Object.fromEntries(canonicalTaskImportFields.map((field) => [field, value[mapping[field]]]));
  if (typeof mapped.verifierConfig === "string") {
    try { mapped.verifierConfig = JSON.parse(mapped.verifierConfig); } catch { /* Validation reports the invalid value. */ }
  }
  return mapped;
}

function summarize(rows: TaskImportRow[]): TaskImportPreview {
  const validRows = rows.filter((row) => row.task).length;
  return { totalRows: rows.length, validRows, invalidRows: rows.length - validRows, duplicateRows: rows.filter((row) => row.duplicate).length, rows };
}

function identityMapping() { return Object.fromEntries(canonicalTaskImportFields.map((field) => [field, field])) as ColumnMapping; }
function normalizeColumn(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function importLimit(content: string) { return new TextEncoder().encode(content).byteLength > MAX_TASK_IMPORT_BYTES ? "File exceeds " + MAX_TASK_IMPORT_BYTES + " bytes." : undefined; }
function failure(errors: string[]) { return { success: false as const, errors }; }
function formatIssue(issue: z.core.$ZodIssue) { return (issue.path.join(".") || "row") + ": " + issue.message; }
function empty(error: string): TaskImportPreview { return { totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0, rows: [], error }; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
