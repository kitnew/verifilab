export type EvaluationExportFormat = "jsonl" | "csv";

export type EvaluationExportResult = {
  sequenceNumber: number;
  candidateResponse: string;
  passed: boolean | null;
  reward: number | null;
  status: string;
  modelName: string | null;
  modelVersion: string | null;
  temperature: number | null;
  seed: number | null;
  externalId: string | null;
  details: string | null;
  normalizedCandidate: string | null;
  executionTimeMs: number | null;
  metadata: unknown;
};

export type EvaluationExportBatch = {
  id: string;
  name: string;
  taskId: string;
  taskPromptSnapshot: string;
  verifierTypeSnapshot: string;
  verifierConfigSnapshot: unknown;
  createdAt: Date;
  results: EvaluationExportResult[];
};

export function evaluationExportRows(batch: EvaluationExportBatch) {
  return [...batch.results].sort((left, right) => left.sequenceNumber - right.sequenceNumber).map((result) => ({
    batchId: batch.id,
    taskId: batch.taskId,
    taskPrompt: batch.taskPromptSnapshot,
    sequenceNumber: result.sequenceNumber,
    candidateResponse: result.candidateResponse,
    status: result.status,
    passed: result.passed,
    reward: result.reward,
    verifierType: batch.verifierTypeSnapshot,
    verifierConfig: batch.verifierConfigSnapshot,
    modelName: result.modelName,
    modelVersion: result.modelVersion,
    temperature: result.temperature,
    seed: result.seed,
    externalId: result.externalId,
    details: result.details,
    normalizedCandidate: result.normalizedCandidate,
    executionTimeMs: result.executionTimeMs,
    metadata: result.metadata ?? {},
  }));
}

export function serializeEvaluation(batch: EvaluationExportBatch, format: EvaluationExportFormat) {
  const rows = evaluationExportRows(batch);
  if (format === "jsonl") return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  const headers = ["batchId", "taskId", "sequenceNumber", "candidateResponse", "status", "passed", "reward", "verifierType", "verifierConfig", "modelName", "modelVersion", "temperature", "seed", "externalId", "details", "normalizedCandidate", "executionTimeMs", "metadata"] as const;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(typeof row[header] === "object" && row[header] !== null ? JSON.stringify(row[header]) : row[header])).join(","))].join("\r\n") + "\r\n";
}

export function evaluationExportFilename(name: string, createdAt: Date, format: EvaluationExportFormat) {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "batch";
  return `verifilab-evaluation-${slug}-${createdAt.toISOString().slice(0, 10)}.${format}`;
}

export function evaluationContentDisposition(name: string, createdAt: Date, format: EvaluationExportFormat) {
  return `attachment; filename="${evaluationExportFilename(name, createdAt, format)}"`;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
