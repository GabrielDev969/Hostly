-- AddColumn
ALTER TABLE "Permission" ADD COLUMN "workspaceId" TEXT;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "Permission_key_key";

-- CreateIndex (partial uniques replace the global key @unique)
CREATE UNIQUE INDEX "Permission_key_global_unique" ON "Permission"("key") WHERE "workspaceId" IS NULL;
CREATE UNIQUE INDEX "Permission_workspaceId_key_unique" ON "Permission"("workspaceId", "key") WHERE "workspaceId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Permission_workspaceId_idx" ON "Permission"("workspaceId");
