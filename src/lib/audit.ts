const labels: Record<string, string> = {
  ACCOUNT_CREATED: "Account created",
  PROJECT_CREATED: "Project created",
  TASK_CREATED: "Task created",
  TASK_UPDATED: "Task updated",
  VERIFIER_VERSION_CREATED: "Verifier version created",
  VERIFIER_VERSION_RESTORED: "Verifier version restored",
  TASK_DUPLICATED: "Task duplicated",
  VERIFICATION_EXECUTED: "Verification executed",
  TASK_SUBMIT: "Review submitted",
  TASK_APPROVE: "Task approved",
  TASK_REJECT: "Task rejected",
  PROJECT_ROLE_CHANGED: "Project role changed",
  TASK_AUTHOR_ASSIGNED: "Author assigned",
  TASK_REVIEWER_ASSIGNED: "Reviewer assigned",
  TASK_WORK_STARTED: "Task work started",
  TASK_SUBMITTED_FOR_REVIEW: "Task submitted for review",
  TASK_CHANGES_REQUESTED: "Changes requested",
  TASK_APPROVED: "Task approved",
  TASK_REJECTED: "Task rejected",
  DATASET_CREATED: "Dataset created",
  TASK_ADDED_TO_DATASET: "Task added to dataset",
  DATASET_EXPORTED: "Dataset exported",
  DATASET_QUALITY_SCANNED: "Dataset quality scanned",
  DATASET_RELEASE_CREATED: "Dataset release created",
  TASK_ADDED_TO_RELEASE: "Task added to release",
  DATASET_RELEASE_EXPORTED: "Dataset release exported",
  EVALUATION_BATCH_CREATED: "Evaluation batch created",
  EVALUATION_RESPONSES_IMPORTED: "Evaluation responses imported",
  EVALUATION_STARTED: "Evaluation started",
  EVALUATION_CANCELLED: "Evaluation cancelled",
  EVALUATION_COMPLETED: "Evaluation completed",
  EVALUATION_FAILED: "Evaluation failed",
  EVALUATION_RESULTS_RERUN: "Evaluation results rerun",
  EVALUATION_EXPORTED: "Evaluation exported",
  EVALUATION_BATCH_DELETED: "Evaluation batch deleted",
};

export function auditLabel(action: string) {
  return labels[action] ?? action.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function auditDetail(action: string, value: unknown) {
  const metadata = object(value);
  if (action === "VERIFICATION_EXECUTED") return `${metadata.passed ? "PASS" : "FAIL"} · reward ${number(metadata.reward)} · ${number(metadata.executionTimeMs).toFixed(3)} ms`;
  if (action === "VERIFIER_VERSION_CREATED") return `Version ${number(metadata.version)}`;
  if (action === "VERIFIER_VERSION_RESTORED") return `Version ${number(metadata.version)} from version ${number(metadata.sourceVersion)}`;
  if (action === "DATASET_CREATED") return string(metadata.datasetName);
  if (action === "TASK_ADDED_TO_DATASET") return `Added to ${string(metadata.datasetName)}`;
  if (action === "DATASET_EXPORTED") return `${string(metadata.datasetName)} · ${string(metadata.format).toUpperCase()}`;
  if (action === "DATASET_QUALITY_SCANNED") return `${number(metadata.taskCount)} tasks · score ${number(metadata.score)}`;
  if (action === "DATASET_RELEASE_CREATED") return `${string(metadata.version)} · ${number(metadata.taskCount)} tasks`;
  if (action === "DATASET_RELEASE_EXPORTED") return `${string(metadata.version)} · ${string(metadata.split)}`;
  if (action === "EVALUATION_RESPONSES_IMPORTED") return `${number(metadata.validCount)} valid · ${number(metadata.invalidCount)} invalid`;
  if (action === "EVALUATION_RESULTS_RERUN") return `${number(metadata.affected)} results · ${string(metadata.mode).toLowerCase()}`;
  if (action === "EVALUATION_EXPORTED") return `${number(metadata.resultCount)} results · ${string(metadata.format).toUpperCase()}`;
  if (action === "EVALUATION_BATCH_DELETED") return `${string(metadata.batchName)} · ${number(metadata.resultCount)} results`;
  if (["TASK_SUBMIT", "TASK_APPROVE", "TASK_REJECT", "TASK_WORK_STARTED", "TASK_SUBMITTED_FOR_REVIEW", "TASK_CHANGES_REQUESTED", "TASK_APPROVED", "TASK_REJECTED"].includes(action) && metadata.role) return `${string(metadata.from)} → ${string(metadata.to)} · ${string(metadata.role).toLowerCase()}`;
  return "";
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "Unknown";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
