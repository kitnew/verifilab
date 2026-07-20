-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requestedCount" INTEGER NOT NULL,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "seed" TEXT NOT NULL,
    "generatorType" TEXT NOT NULL,
    "generatorVersion" INTEGER NOT NULL DEFAULT 1,
    "difficulty" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "verifierType" TEXT NOT NULL,
    "verifierConfig" JSONB NOT NULL,
    "difficulty" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tags" JSONB NOT NULL,
    "expectedAnswer" TEXT,
    "generatorTemplate" TEXT,
    "generatorVersion" INTEGER,
    "generationSeed" TEXT,
    "generationBatchId" TEXT,
    "generationFingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_generationBatchId_fkey" FOREIGN KEY ("generationBatchId") REFERENCES "GenerationJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "difficulty", "id", "projectId", "prompt", "status", "tags", "title", "updatedAt", "verifierConfig", "verifierType") SELECT "createdAt", "difficulty", "id", "projectId", "prompt", "status", "tags", "title", "updatedAt", "verifierConfig", "verifierType" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_generationBatchId_idx" ON "Task"("generationBatchId");
CREATE UNIQUE INDEX "Task_projectId_generationFingerprint_key" ON "Task"("projectId", "generationFingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GenerationJob_projectId_idx" ON "GenerationJob"("projectId");

-- CreateIndex
CREATE INDEX "GenerationJob_createdAt_idx" ON "GenerationJob"("createdAt");
