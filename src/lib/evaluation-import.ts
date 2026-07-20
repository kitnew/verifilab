import { createHash } from "node:crypto";
import Papa from "papaparse";
import { evaluationCandidateSchema, MAX_EVALUATION_FILE_BYTES, MAX_EVALUATION_RESPONSES, type EvaluationCandidate } from "@/lib/evaluation";

export type ImportIssue = { line: number; error: string; raw: string };
export type ImportPreview = { valid: EvaluationCandidate[]; invalid: ImportIssue[]; totalRows: number; duplicateCount: number; fingerprint: string; error?: string };

export function parseJsonlImport(content: string): ImportPreview {
  const limited = limit(content);
  if (limited) return empty(content, limited);
  const valid: EvaluationCandidate[] = [];
  const invalid: ImportIssue[] = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    try {
      const parsed = evaluationCandidateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) valid.push(parsed.data); else invalid.push(issue(index + 1, parsed.error.issues[0].message, raw));
    } catch {
      invalid.push(issue(index + 1, "Malformed JSON.", raw));
    }
  }
  return finish(content, valid, invalid);
}

export function parseCsvImport(content: string): ImportPreview {
  const limited = limit(content);
  if (limited) return empty(content, limited);
  const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: "greedy" });
  if (!parsed.meta.fields?.includes("response")) return empty(content, "CSV must include a response header.");
  const errorsByRow = new Map<number, string[]>();
  for (const error of parsed.errors) {
    const row = (error.row ?? 0) + 2;
    errorsByRow.set(row, [...(errorsByRow.get(row) ?? []), error.message]);
  }
  const valid: EvaluationCandidate[] = [];
  const invalid: ImportIssue[] = [];
  parsed.data.forEach((row, index) => {
    const line = index + 2;
    const parserErrors = errorsByRow.get(line);
    if (parserErrors?.length) return invalid.push(issue(line, parserErrors.join(" "), JSON.stringify(row)));
    const candidate = candidateFromCsv(row);
    if (typeof candidate === "string") return invalid.push(issue(line, candidate, JSON.stringify(row)));
    const result = evaluationCandidateSchema.safeParse(candidate);
    if (result.success) valid.push(result.data); else invalid.push(issue(line, result.error.issues[0].message, JSON.stringify(row)));
  });
  return finish(content, valid, invalid);
}

export function importFingerprint(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function candidateFromCsv(row: Record<string, string>): EvaluationCandidate | string {
  const metadata = optionalJson(row.metadata);
  if (typeof metadata === "string") return metadata;
  const temperature = optionalNumber(row.temperature, false);
  if (typeof temperature === "string") return temperature;
  const seed = optionalNumber(row.seed, true);
  if (typeof seed === "string") return seed;
  return { response: row.response ?? "", externalId: row.externalId || undefined, modelName: row.modelName || undefined, modelVersion: row.modelVersion || undefined, temperature, seed, metadata };
}

function optionalNumber(value: string | undefined, integer: boolean): number | undefined | string {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) return integer ? "Seed must be an integer." : "Temperature must be a finite number.";
  return parsed;
}

function optionalJson(value: string | undefined): Record<string, unknown> | undefined | string {
  if (!value?.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : "Metadata must be a JSON object.";
  } catch { return "Metadata must be valid JSON."; }
}

function limit(content: string) {
  if (new TextEncoder().encode(content).byteLength > MAX_EVALUATION_FILE_BYTES) return `File exceeds ${MAX_EVALUATION_FILE_BYTES} bytes.`;
}

function finish(content: string, valid: EvaluationCandidate[], invalid: ImportIssue[]): ImportPreview {
  const totalRows = valid.length + invalid.length;
  if (totalRows > MAX_EVALUATION_RESPONSES) return empty(content, `Maximum batch size is ${MAX_EVALUATION_RESPONSES}.`);
  return { valid, invalid, totalRows, duplicateCount: duplicateCount(valid), fingerprint: importFingerprint(content) };
}

function empty(content: string, error: string): ImportPreview {
  return { valid: [], invalid: [], totalRows: 0, duplicateCount: 0, fingerprint: importFingerprint(content), error };
}

function issue(line: number, error: string, raw: string): ImportIssue {
  return { line, error, raw: raw.slice(0, 300) };
}

function duplicateCount(candidates: EvaluationCandidate[]) {
  const seen = new Set<string>();
  return candidates.reduce((count, candidate) => {
    const key = candidate.response.replace(/\r\n?/g, "\n").trim();
    if (seen.has(key)) return count + 1;
    seen.add(key);
    return count;
  }, 0);
}
