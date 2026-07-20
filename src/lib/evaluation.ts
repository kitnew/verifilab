import { z } from "zod";
import type { Verifier, VerificationResult } from "@/lib/verifier";

export const MAX_EVALUATION_RESPONSES = 500;
export const MAX_EVALUATION_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CANDIDATE_LENGTH = 10_000;
export const EVALUATION_CHUNK_SIZE = 25;
export const evaluationBatchStatuses = ["DRAFT", "QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export const evaluationSourceTypes = ["MANUAL", "BULK_TEXT", "JSONL", "CSV"] as const;
export const evaluationResultStatuses = ["PENDING", "RUNNING", "PASSED", "FAILED", "INVALID", "ERROR"] as const;
export const rerunModes = ["ALL", "FAILED", "ERROR", "SELECTED"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalFinite = z.number().finite().optional();

export const evaluationCandidateSchema = z.object({
  response: z.string({ error: "Response is required." }).min(1, "Response is required.").max(MAX_CANDIDATE_LENGTH, "Response is too long."),
  externalId: optionalText(200),
  modelName: optionalText(120),
  modelVersion: optionalText(120),
  temperature: optionalFinite.refine((value) => value === undefined || (value >= 0 && value <= 2), "Temperature must be between 0 and 2."),
  seed: z.number().finite().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().refine(jsonObjectWithinLimit, "Metadata must be valid JSON under 20 KB."),
});

export const evaluationBatchSchema = z.object({
  taskId: z.string().min(1, "Task is required."),
  name: z.string().trim().min(1, "Batch name is required.").max(120),
  description: z.string().trim().max(1_000).default(""),
  sourceType: z.enum(evaluationSourceTypes),
  modelName: optionalText(120),
  modelVersion: optionalText(120),
  temperature: optionalFinite.refine((value) => value === undefined || (value >= 0 && value <= 2), "Temperature must be between 0 and 2."),
  topP: optionalFinite.refine((value) => value === undefined || (value >= 0 && value <= 1), "Top-p must be between 0 and 1."),
  seed: z.number().finite().int().optional(),
  candidates: z.array(evaluationCandidateSchema).min(1, "Add at least one candidate response.").max(MAX_EVALUATION_RESPONSES),
  invalidCount: z.number().int().min(0).max(MAX_EVALUATION_RESPONSES).default(0),
  importFingerprint: optionalText(100),
  removeDuplicates: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.candidates.length + value.invalidCount > MAX_EVALUATION_RESPONSES) context.addIssue({ code: "custom", path: ["candidates"], message: `Maximum batch size is ${MAX_EVALUATION_RESPONSES}.` });
  if ((value.sourceType === "JSONL" || value.sourceType === "CSV") && !value.importFingerprint) context.addIssue({ code: "custom", path: ["importFingerprint"], message: "Imported files require a fingerprint." });
});

export const rerunRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ALL"), batchId: z.string().min(1) }),
  z.object({ mode: z.literal("FAILED"), batchId: z.string().min(1) }),
  z.object({ mode: z.literal("ERROR"), batchId: z.string().min(1) }),
  z.object({ mode: z.literal("SELECTED"), batchId: z.string().min(1), resultIds: z.array(z.string().min(1)).min(1).max(MAX_EVALUATION_RESPONSES).transform((ids) => [...new Set(ids)]) }),
]);

export type EvaluationCandidate = z.infer<typeof evaluationCandidateSchema>;
export type EvaluationBatchInput = z.input<typeof evaluationBatchSchema>;
export type EvaluationBatchStatus = (typeof evaluationBatchStatuses)[number];
export type EvaluationResultStatus = (typeof evaluationResultStatuses)[number];

export type VerifierSnapshot = {
  taskTitle: string;
  taskPrompt: string;
  verifierType: Verifier["type"];
  verifierConfig: unknown;
  taskUpdatedAt: Date;
};

export function createVerifierSnapshot(task: { title: string; prompt: string; verifierType: Verifier["type"]; verifierConfig: unknown; updatedAt: Date }): VerifierSnapshot {
  return { taskTitle: task.title, taskPrompt: task.prompt, verifierType: task.verifierType, verifierConfig: structuredClone(task.verifierConfig), taskUpdatedAt: new Date(task.updatedAt) };
}

const transitions: Record<EvaluationBatchStatus, EvaluationBatchStatus[]> = {
  DRAFT: ["QUEUED", "CANCELLED"],
  QUEUED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: ["QUEUED"],
  FAILED: ["QUEUED", "CANCELLED"],
  CANCELLED: ["QUEUED"],
};

export function canTransitionEvaluation(from: EvaluationBatchStatus, to: EvaluationBatchStatus) {
  return transitions[from].includes(to);
}

export function normalizeDuplicateResponse(response: string) {
  return response.replace(/\r\n?/g, "\n").trim();
}

export function duplicateResponseCount(candidates: Pick<EvaluationCandidate, "response">[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const candidate of candidates) {
    const key = normalizeDuplicateResponse(candidate.response);
    if (seen.has(key)) duplicates += 1; else seen.add(key);
  }
  return duplicates;
}

export function removeDuplicateResponses(candidates: EvaluationCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalizeDuplicateResponse(candidate.response);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type EvaluationMetricInput = { status: EvaluationResultStatus; reward: number | null; executionTimeMs: number | null };

export function evaluationMetrics(results: EvaluationMetricInput[], sourceInvalidCount = 0) {
  const passed = results.filter((result) => result.status === "PASSED").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const invalid = sourceInvalidCount + results.filter((result) => result.status === "INVALID").length;
  const errors = results.filter((result) => result.status === "ERROR").length;
  const rewards = results.flatMap((result) => result.reward === null ? [] : [result.reward]);
  const times = results.flatMap((result) => result.executionTimeMs === null ? [] : [result.executionTimeMs]).sort((a, b) => a - b);
  const processed = passed + failed + invalid + errors;
  return {
    total: results.length + sourceInvalidCount,
    processed,
    passed,
    failed,
    invalid,
    errors,
    passRate: ratio(passed, passed + failed),
    averageReward: average(rewards),
    averageVerificationTime: average(times),
    medianVerificationTime: median(times),
    minimumVerificationTime: times[0] ?? 0,
    maximumVerificationTime: times.at(-1) ?? 0,
  };
}

export function evaluationResultFromVerification(result: VerificationResult) {
  return {
    status: result.passed ? "PASSED" as const : "FAILED" as const,
    passed: result.passed,
    reward: result.reward,
    details: result.details,
    normalizedCandidate: result.normalizedCandidate,
    executionTimeMs: result.executionTimeMs,
  };
}

export function rerunStatuses(mode: "ALL" | "FAILED" | "ERROR") {
  return mode === "ALL" ? ["PASSED", "FAILED", "INVALID", "ERROR"] as const : mode === "FAILED" ? ["FAILED"] as const : ["ERROR"] as const;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function jsonObjectWithinLimit(value: Record<string, unknown> | undefined) {
  if (value === undefined) return true;
  try { return JSON.stringify(value).length <= 20_000; } catch { return false; }
}
