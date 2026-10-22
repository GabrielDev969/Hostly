-- CreateTable
CREATE TABLE "WorkspaceFeatureFlag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeatureFlag_workspaceId_key_key" ON "WorkspaceFeatureFlag"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "WorkspaceFeatureFlag_key_idx" ON "WorkspaceFeatureFlag"("key");

-- AddForeignKey
ALTER TABLE "WorkspaceFeatureFlag" ADD CONSTRAINT "WorkspaceFeatureFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
