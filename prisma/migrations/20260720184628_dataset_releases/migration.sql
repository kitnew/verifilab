-- CreateTable
CREATE TABLE "DatasetRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "seed" TEXT NOT NULL,
    "trainPercentage" INTEGER NOT NULL,
    "validationPercentage" INTEGER NOT NULL,
    "testPercentage" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "trainCount" INTEGER NOT NULL,
    "validationCount" INTEGER NOT NULL,
    "testCount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatasetRelease_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DatasetRelease_datasetId_createdAt_idx" ON "DatasetRelease"("datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRelease_datasetId_version_key" ON "DatasetRelease"("datasetId", "version");
