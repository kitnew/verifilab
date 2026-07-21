-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "assignedAuthorId" TEXT,
    "assignedReviewerId" TEXT,
    "dueDate" DATETIME,
    "authorAssignedAt" DATETIME,
    "reviewerAssignedAt" DATETIME,
    "submittedAt" DATETIME,
    "completedAt" DATETIME,
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
    CONSTRAINT "Task_generationBatchId_fkey" FOREIGN KEY ("generationBatchId") REFERENCES "GenerationJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedAuthorId_fkey" FOREIGN KEY ("assignedAuthorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "difficulty", "expectedAnswer", "generationBatchId", "generationFingerprint", "generationSeed", "generatorTemplate", "generatorVersion", "id", "projectId", "prompt", "status", "tags", "title", "updatedAt", "verifierConfig", "verifierType") SELECT "createdAt", "difficulty", "expectedAnswer", "generationBatchId", "generationFingerprint", "generationSeed", "generatorTemplate", "generatorVersion", "id", "projectId", "prompt", "status", "tags", "title", "updatedAt", "verifierConfig", "verifierType" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_projectId_generationFingerprint_key" ON "Task"("projectId", "generationFingerprint");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_generationBatchId_idx" ON "Task"("generationBatchId");
CREATE INDEX "Task_assignedAuthorId_status_idx" ON "Task"("assignedAuthorId", "status");
CREATE INDEX "Task_assignedReviewerId_status_idx" ON "Task"("assignedReviewerId", "status");
CREATE INDEX "Task_dueDate_status_idx" ON "Task"("dueDate", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "ProjectMembership_projectId_userId_key" ON "ProjectMembership"("projectId", "userId");
CREATE INDEX "ProjectMembership_userId_role_idx" ON "ProjectMembership"("userId", "role");

-- Keep the demo usable after applying the migration to an existing database.
INSERT INTO "User" ("id", "name", "email", "isAdmin", "updatedAt") VALUES
  ('demo-admin', 'Ada Admin', 'admin@verifilab.local', true, CURRENT_TIMESTAMP),
  ('demo-author', 'Ari Author', 'author@verifilab.local', false, CURRENT_TIMESTAMP),
  ('demo-reviewer', 'Riley Reviewer', 'reviewer@verifilab.local', false, CURRENT_TIMESTAMP),
  ('demo-curator', 'Casey Curator', 'curator@verifilab.local', false, CURRENT_TIMESTAMP);
INSERT INTO "ProjectMembership" ("id", "projectId", "userId", "role", "updatedAt")
SELECT 'admin-' || "id", "id", 'demo-admin', 'ADMIN', CURRENT_TIMESTAMP FROM "Project";
INSERT INTO "ProjectMembership" ("id", "projectId", "userId", "role", "updatedAt")
SELECT 'author-' || "id", "id", 'demo-author', 'AUTHOR', CURRENT_TIMESTAMP FROM "Project";
INSERT INTO "ProjectMembership" ("id", "projectId", "userId", "role", "updatedAt")
SELECT 'reviewer-' || "id", "id", 'demo-reviewer', 'REVIEWER', CURRENT_TIMESTAMP FROM "Project";
INSERT INTO "ProjectMembership" ("id", "projectId", "userId", "role", "updatedAt")
SELECT 'curator-' || "id", "id", 'demo-curator', 'CURATOR', CURRENT_TIMESTAMP FROM "Project";
