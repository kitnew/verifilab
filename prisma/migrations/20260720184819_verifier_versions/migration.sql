-- CreateTable
CREATE TABLE "VerifierVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "verifierType" TEXT NOT NULL,
    "verifierConfig" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerifierVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill every existing task with its current verifier as immutable version 1.
INSERT INTO "VerifierVersion" ("id", "taskId", "version", "verifierType", "verifierConfig", "changeSummary", "createdAt")
SELECT "id" || '_verifier_v1', "id", 1, "verifierType",
  CASE "verifierType"
    WHEN 'EXACT_MATCH' THEN json_set(
      "verifierConfig",
      '$.caseSensitive', json(CASE WHEN json_extract("verifierConfig", '$.caseSensitive') THEN 'true' ELSE 'false' END),
      '$.trimWhitespace', json(CASE WHEN COALESCE(json_extract("verifierConfig", '$.trimWhitespace'), 1) THEN 'true' ELSE 'false' END)
    )
    WHEN 'REGEX' THEN json_set("verifierConfig", '$.flags', COALESCE(json_extract("verifierConfig", '$.flags'), ''))
    ELSE "verifierConfig"
  END,
  'Initial version (backfilled)', "createdAt"
FROM "Task";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VerificationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "verifierVersionId" TEXT NOT NULL,
    "candidate" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VerificationRun_verifierVersionId_fkey" FOREIGN KEY ("verifierVersionId") REFERENCES "VerifierVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VerificationRun" ("candidate", "createdAt", "details", "id", "passed", "taskId", "verifierVersionId")
SELECT run."candidate", run."createdAt", run."details", run."id", run."passed", run."taskId", run."taskId" || '_verifier_v1'
FROM "VerificationRun" AS run;
DROP TABLE "VerificationRun";
ALTER TABLE "new_VerificationRun" RENAME TO "VerificationRun";
CREATE INDEX "VerificationRun_taskId_idx" ON "VerificationRun"("taskId");
CREATE INDEX "VerificationRun_verifierVersionId_idx" ON "VerificationRun"("verifierVersionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VerifierVersion_taskId_createdAt_idx" ON "VerifierVersion"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerifierVersion_taskId_version_key" ON "VerifierVersion"("taskId", "version");
