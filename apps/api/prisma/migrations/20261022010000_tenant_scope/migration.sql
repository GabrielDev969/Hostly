-- Hostly tenant scope: memberships carry client/advertiser ids; audit rows carry organization and client.
-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "organizationId" TEXT;

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
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- An advertiser always belongs to a client.
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_advertiser_requires_client" CHECK ("advertiserId" IS NULL OR "clientId" IS NOT NULL);
