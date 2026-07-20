import { z } from "zod";
import { evaluationMetrics, type EvaluationResultStatus } from "@/lib/evaluation";
import { storedVerifierSchema } from "@/lib/validation";
import type { Verifier } from "@/lib/verifier";

export const qualityWeights = {
  completeness: 25,
  verifierValidity: 30,
  duplicateSafety: 20,
  verificationEvidence: 25,
} as const;

export const qualitySeverities = ["ERROR", "WARNING", "INFO"] as const;
export const qualityCategories = ["CONTENT", "VERIFIER", "DUPLICATE", "EVIDENCE", "METADATA"] as const;

export type QualitySeverity = (typeof qualitySeverities)[number];
export type QualityCategory = (typeof qualityCategories)[number];
export const qualityIssueSchema = z.object({ severity: z.enum(qualitySeverities), category: z.enum(qualityCategories), explanation: z.string(), taskIds: z.array(z.string()), recommendation: z.string() });
export type QualityIssue = z.infer<typeof qualityIssueSchema>;

type RolloutResult = { status: EvaluationResultStatus; reward: number | null; executionTimeMs: number | null };
export type QualityTask = {
  id: string;
  title: string;
  prompt: string;
  status: string;
  verifierType: Verifier["type"];
  verifierConfig: unknown;
  difficulty: string | null;
  tags: unknown;
  generatorTemplate: string | null;
  verificationRuns: { passed: boolean }[];
  evaluationBatches: { results: RolloutResult[] }[];
};

const distributionSchema = z.record(z.string(), z.number().int().nonnegative());
export const qualityDistributionsSchema = z.object({ difficulty: distributionSchema, verifierType: distributionSchema, source: distributionSchema, verificationPassRate: distributionSchema });
export type QualityDistributions = z.infer<typeof qualityDistributionsSchema>;

export type DatasetQualityAnalysis = {
  taskCount: number;
  overallScore: number;
  completenessScore: number;
  verifierValidityScore: number;
  duplicateSafetyScore: number;
  verificationEvidenceScore: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: QualityIssue[];
  distributions: QualityDistributions;
};

export function normalizeQualityPrompt(prompt: string) {
  return prompt.replace(/\r\n?/g, "\n").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function analyzeDatasetQuality(tasks: QualityTask[]): DatasetQualityAnalysis {
  const issues: QualityIssue[] = [];
  const completeness = new Set<string>();
  const invalidVerifiers = new Set<string>();
  const duplicates = new Set<string>();
  const weakEvidence = new Set<string>();
  const prompts = new Map<string, string[]>();
  const distributions: QualityDistributions = { difficulty: {}, verifierType: {}, source: {}, verificationPassRate: {} };

  for (const task of tasks) {
    if (!task.title.trim()) {
      completeness.add(task.id);
      issues.push(issue("ERROR", "CONTENT", "Task title is blank.", task.id, "Add a concise descriptive title."));
    }
    if (!task.prompt.trim()) {
      completeness.add(task.id);
      issues.push(issue("ERROR", "CONTENT", "Task prompt is blank.", task.id, "Add the complete candidate-facing prompt."));
    } else {
      const normalized = normalizeQualityPrompt(task.prompt);
      prompts.set(normalized, [...(prompts.get(normalized) ?? []), task.id]);
    }
    if (!task.difficulty) {
      completeness.add(task.id);
      issues.push(issue("WARNING", "METADATA", "Task difficulty is missing.", task.id, "Assign an EASY, MEDIUM, or HARD difficulty."));
    }
    if (!Array.isArray(task.tags) || !task.tags.some((tag) => typeof tag === "string" && tag.trim())) {
      completeness.add(task.id);
      issues.push(issue("INFO", "METADATA", "Task has no tags.", task.id, "Add at least one useful discovery tag."));
    }
    if (!isCompleteVerifier(task)) {
      invalidVerifiers.add(task.id);
      issues.push(issue("ERROR", "VERIFIER", "Verifier configuration is invalid or incomplete.", task.id, "Open the task and save a complete verifier configuration."));
    }
    if (task.status === "APPROVED" && task.verificationRuns.length === 0) {
      weakEvidence.add(task.id);
      issues.push(issue("WARNING", "EVIDENCE", "Approved task has no verification runs.", task.id, "Run at least one representative response in the verification playground."));
    }

    const rollouts = task.evaluationBatches.flatMap((batch) => batch.results).filter((result) => result.status === "PASSED" || result.status === "FAILED");
    const rolloutMetrics = evaluationMetrics(rollouts);
    if (rollouts.length > 0 && rolloutMetrics.passed === rollouts.length) {
      weakEvidence.add(task.id);
      issues.push(issue("INFO", "EVIDENCE", "All recorded rollout evaluations pass.", task.id, "Add adversarial or incorrect responses to test verifier selectivity."));
    } else if (rollouts.length > 0 && rolloutMetrics.failed === rollouts.length) {
      weakEvidence.add(task.id);
      issues.push(issue("WARNING", "EVIDENCE", "All recorded rollout evaluations fail.", task.id, "Check the expected answer and include at least one known-good response."));
    }

    count(distributions.difficulty, task.difficulty || "MISSING");
    count(distributions.verifierType, task.verifierType);
    count(distributions.source, task.generatorTemplate || "MANUAL");
    const passes = task.verificationRuns.filter((run) => run.passed).length + rolloutMetrics.passed;
    const failures = task.verificationRuns.filter((run) => !run.passed).length + rolloutMetrics.failed;
    count(distributions.verificationPassRate, passRateBucket(passes, failures));
  }

  for (const taskIds of prompts.values()) {
    if (taskIds.length < 2) continue;
    taskIds.forEach((taskId) => duplicates.add(taskId));
    issues.push({ severity: "WARNING", category: "DUPLICATE", explanation: `Normalized prompt is shared by ${taskIds.length} tasks.`, taskIds, recommendation: "Keep one task or make each prompt materially distinct." });
  }

  const taskCount = tasks.length;
  const completenessScore = categoryScore(qualityWeights.completeness, completeness.size, taskCount);
  const verifierValidityScore = categoryScore(qualityWeights.verifierValidity, invalidVerifiers.size, taskCount);
  const duplicateSafetyScore = categoryScore(qualityWeights.duplicateSafety, duplicates.size, taskCount);
  const verificationEvidenceScore = categoryScore(qualityWeights.verificationEvidence, weakEvidence.size, taskCount);
  return {
    taskCount,
    overallScore: completenessScore + verifierValidityScore + duplicateSafetyScore + verificationEvidenceScore,
    completenessScore,
    verifierValidityScore,
    duplicateSafetyScore,
    verificationEvidenceScore,
    errorCount: issues.filter((value) => value.severity === "ERROR").length,
    warningCount: issues.filter((value) => value.severity === "WARNING").length,
    infoCount: issues.filter((value) => value.severity === "INFO").length,
    issues,
    distributions,
  };
}

function categoryScore(weight: number, affected: number, total: number) {
  return total ? Math.round(weight * (total - affected) / total) : 0;
}

function issue(severity: QualitySeverity, category: QualityCategory, explanation: string, taskId: string, recommendation: string): QualityIssue {
  return { severity, category, explanation, taskIds: [taskId], recommendation };
}

function count(values: Record<string, number>, key: string) {
  values[key] = (values[key] ?? 0) + 1;
}

function passRateBucket(passed: number, failed: number) {
  const total = passed + failed;
  if (!total) return "NO_EVIDENCE";
  const rate = passed / total;
  if (rate === 0) return "0%";
  if (rate === 1) return "100%";
  return rate < 0.5 ? "1–49%" : "50–99%";
}

function isCompleteVerifier(task: Pick<QualityTask, "verifierType" | "verifierConfig">) {
  const parsed = storedVerifierSchema.safeParse({ type: task.verifierType, config: task.verifierConfig });
  if (!parsed.success) return false;
  if (parsed.data.type === "EXACT_MATCH") return Boolean(parsed.data.config.expected.trim());
  if (parsed.data.type === "REGEX") return Boolean(parsed.data.config.pattern);
  return true;
}
