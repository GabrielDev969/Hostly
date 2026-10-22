-- Hostly tenant scope: memberships carry client/advertiser ids; audit rows carry organization and client.
-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "hashVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "organizationId" TEXT;

-- Existing rows keep hashVersion 1 (their hash never covered these columns), so filling
-- organizationId from their workspace does not break the chain.
UPDATE "AuditLog" a
SET "organizationId" = w."organizationId"
FROM "Workspace" w
WHERE a."workspaceId" = w."id" AND a."organizationId" IS NULL;

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "advertiserId" TEXT,
ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_clientId_idx" ON "AuditLog"("clientId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_clientId_idx" ON "WorkspaceMember"("clientId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_advertiserId_idx" ON "WorkspaceMember"("advertiserId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- An advertiser always belongs to a client.
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_advertiser_requires_client" CHECK ("advertiserId" IS NULL OR "clientId" IS NOT NULL);
