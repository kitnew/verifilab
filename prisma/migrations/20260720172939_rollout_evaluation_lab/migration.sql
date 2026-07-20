-- CreateTable
CREATE TABLE "EvaluationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceType" TEXT NOT NULL,
    "modelName" TEXT,
    "modelVersion" TEXT,
    "temperature" REAL,
    "topP" REAL,
    "seed" INTEGER,
    "requestedCount" INTEGER NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "taskTitleSnapshot" TEXT NOT NULL,
    "taskPromptSnapshot" TEXT NOT NULL,
    "verifierTypeSnapshot" TEXT NOT NULL,
    "verifierConfigSnapshot" JSONB NOT NULL,
    "taskUpdatedAtSnapshot" DATETIME NOT NULL,
    "importFingerprint" TEXT,
    "createdBy" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationBatch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationBatchId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "candidateResponse" TEXT NOT NULL,
    "modelName" TEXT,
    "modelVersion" TEXT,
    "temperature" REAL,
    "seed" INTEGER,
    "externalId" TEXT,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "passed" BOOLEAN,
    "reward" INTEGER,
    "details" TEXT,
    "normalizedCandidate" TEXT,
    "executionTimeMs" REAL,
    "errorMessage" TEXT,
    "evaluatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationResult_evaluationBatchId_fkey" FOREIGN KEY ("evaluationBatchId") REFERENCES "EvaluationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EvaluationBatch_taskId_createdAt_idx" ON "EvaluationBatch"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationBatch_status_createdAt_idx" ON "EvaluationBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationBatch_modelName_idx" ON "EvaluationBatch"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationBatch_taskId_importFingerprint_key" ON "EvaluationBatch"("taskId", "importFingerprint");

-- CreateIndex
CREATE INDEX "EvaluationResult_evaluationBatchId_status_sequenceNumber_idx" ON "EvaluationResult"("evaluationBatchId", "status", "sequenceNumber");

-- CreateIndex
CREATE INDEX "EvaluationResult_evaluationBatchId_reward_idx" ON "EvaluationResult"("evaluationBatchId", "reward");

-- CreateIndex
CREATE INDEX "EvaluationResult_externalId_idx" ON "EvaluationResult"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_evaluationBatchId_sequenceNumber_key" ON "EvaluationResult"("evaluationBatchId", "sequenceNumber");
