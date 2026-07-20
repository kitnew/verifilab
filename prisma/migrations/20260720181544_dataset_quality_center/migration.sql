-- CreateTable
CREATE TABLE "DatasetQualityReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "taskCount" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "completenessScore" INTEGER NOT NULL,
    "verifierValidityScore" INTEGER NOT NULL,
    "duplicateSafetyScore" INTEGER NOT NULL,
    "verificationEvidenceScore" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "infoCount" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "distributions" JSONB NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DatasetQualityReport_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DatasetQualityReport_datasetId_key" ON "DatasetQualityReport"("datasetId");
