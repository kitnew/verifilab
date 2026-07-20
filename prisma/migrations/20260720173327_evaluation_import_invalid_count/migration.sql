-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvaluationBatch" (
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
    "importInvalidCount" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_EvaluationBatch" ("completedAt", "createdAt", "createdBy", "description", "duplicateCount", "errorCount", "errorMessage", "failedCount", "id", "importFingerprint", "invalidCount", "modelName", "modelVersion", "name", "passedCount", "processedCount", "progress", "requestedCount", "seed", "sourceType", "startedAt", "status", "taskId", "taskPromptSnapshot", "taskTitleSnapshot", "taskUpdatedAtSnapshot", "temperature", "topP", "updatedAt", "verifierConfigSnapshot", "verifierTypeSnapshot") SELECT "completedAt", "createdAt", "createdBy", "description", "duplicateCount", "errorCount", "errorMessage", "failedCount", "id", "importFingerprint", "invalidCount", "modelName", "modelVersion", "name", "passedCount", "processedCount", "progress", "requestedCount", "seed", "sourceType", "startedAt", "status", "taskId", "taskPromptSnapshot", "taskTitleSnapshot", "taskUpdatedAtSnapshot", "temperature", "topP", "updatedAt", "verifierConfigSnapshot", "verifierTypeSnapshot" FROM "EvaluationBatch";
DROP TABLE "EvaluationBatch";
ALTER TABLE "new_EvaluationBatch" RENAME TO "EvaluationBatch";
CREATE INDEX "EvaluationBatch_taskId_createdAt_idx" ON "EvaluationBatch"("taskId", "createdAt");
CREATE INDEX "EvaluationBatch_status_createdAt_idx" ON "EvaluationBatch"("status", "createdAt");
CREATE INDEX "EvaluationBatch_modelName_idx" ON "EvaluationBatch"("modelName");
CREATE UNIQUE INDEX "EvaluationBatch_taskId_importFingerprint_key" ON "EvaluationBatch"("taskId", "importFingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
