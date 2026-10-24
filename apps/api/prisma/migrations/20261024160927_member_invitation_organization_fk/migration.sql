-- Memberships and invitations hold only a client of their own organization: both carry the organization of
-- their workspace, with composite foreign keys to Workspace(id, organizationId) and Client(id, organizationId).
-- Refuse first, before changing anything: inside the transaction below, Prisma would report only
-- "current transaction is aborted" instead of the reason.
DO $$
DECLARE
  members integer;
  invitations integer;
BEGIN
  SELECT count(*) INTO members FROM "WorkspaceMember" m
  JOIN "Workspace" w ON w."id" = m."workspaceId"
  WHERE m."clientId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Client" c WHERE c."id" = m."clientId" AND c."organizationId" = w."organizationId");
  SELECT count(*) INTO invitations FROM "Invitation" i
  JOIN "Workspace" w ON w."id" = i."workspaceId"
  WHERE i."clientId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Client" c WHERE c."id" = i."clientId" AND c."organizationId" = w."organizationId");
  IF members + invitations > 0 THEN
    RAISE EXCEPTION '% membership(s) and % invitation(s) hold a client of another organization; fix them before migrating',
      members, invitations;
  END IF;
END $$;

-- One transaction: Prisma runs the statements one by one, so a failure further down would otherwise
-- leave the old foreign keys dropped and half of the new ones in place.
BEGIN;

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_clientId_fkey";

-- DropForeignKey
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_workspaceId_fkey";

-- AlterTable: the new column copies the organization of each row's workspace, then becomes required.
ALTER TABLE "Invitation" ADD COLUMN "organizationId" TEXT;
UPDATE "Invitation" i SET "organizationId" = w."organizationId" FROM "Workspace" w WHERE w."id" = i."workspaceId";
ALTER TABLE "Invitation" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN "organizationId" TEXT;
UPDATE "WorkspaceMember" m SET "organizationId" = w."organizationId" FROM "Workspace" w WHERE w."id" = m."workspaceId";
ALTER TABLE "WorkspaceMember" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_id_organizationId_key" ON "Workspace"("id", "organizationId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_organizationId_idx" ON "WorkspaceMember"("organizationId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_organizationId_fkey" FOREIGN KEY ("workspaceId", "organizationId") REFERENCES "Workspace"("id", "organizationId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_clientId_organizationId_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_organizationId_fkey" FOREIGN KEY ("workspaceId", "organizationId") REFERENCES "Workspace"("id", "organizationId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clientId_organizationId_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
