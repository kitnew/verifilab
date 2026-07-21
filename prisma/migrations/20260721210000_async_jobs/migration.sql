CREATE TABLE "AsyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "initiatorId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "resultReference" JSONB,
    "safeErrorMessage" TEXT,
    "retrySourceId" TEXT,
    "idempotencyKey" TEXT,
    "cancellationRequestedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelledById" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AsyncJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AsyncJob_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AsyncJob_retrySourceId_fkey" FOREIGN KEY ("retrySourceId") REFERENCES "AsyncJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AsyncJob_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AsyncJob_idempotencyKey_key" ON "AsyncJob"("idempotencyKey");
CREATE INDEX "AsyncJob_projectId_createdAt_idx" ON "AsyncJob"("projectId", "createdAt");
CREATE INDEX "AsyncJob_projectId_status_type_idx" ON "AsyncJob"("projectId", "status", "type");
CREATE INDEX "AsyncJob_initiatorId_createdAt_idx" ON "AsyncJob"("initiatorId", "createdAt");
CREATE INDEX "AsyncJob_retrySourceId_idx" ON "AsyncJob"("retrySourceId");
