CREATE TABLE "GuestWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "User" ADD COLUMN "guestWorkspaceId" TEXT REFERENCES "GuestWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD COLUMN "guestWorkspaceId" TEXT REFERENCES "GuestWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "User_guestWorkspaceId_idx" ON "User"("guestWorkspaceId");
CREATE INDEX "Project_guestWorkspaceId_idx" ON "Project"("guestWorkspaceId");
