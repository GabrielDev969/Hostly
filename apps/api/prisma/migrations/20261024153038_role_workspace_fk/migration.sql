-- Memberships and invitations hold only a role of their own workspace: composite foreign keys to Role(id, workspaceId).
-- Refuse first, before changing anything: inside the transaction below, Prisma would report only
-- "current transaction is aborted" instead of the reason.
DO $$
DECLARE
  members integer;
  invitations integer;
BEGIN
  SELECT count(*) INTO members FROM "WorkspaceMember" m
  WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."id" = m."roleId" AND r."workspaceId" = m."workspaceId");
  SELECT count(*) INTO invitations FROM "Invitation" i
  WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."id" = i."roleId" AND r."workspaceId" = i."workspaceId");
  IF members + invitations > 0 THEN
    RAISE EXCEPTION '% membership(s) and % invitation(s) hold a role outside their workspace; fix them before migrating',
      members, invitations;
  END IF;
END $$;

-- One transaction: Prisma runs the statements one by one, so a failure further down would otherwise
-- leave the old foreign key dropped and half of the new ones in place.
BEGIN;

-- DropForeignKey
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_roleId_fkey";

-- CreateIndex
CREATE INDEX "Invitation_roleId_workspaceId_idx" ON "Invitation"("roleId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_id_workspaceId_key" ON "Role"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_roleId_workspaceId_idx" ON "WorkspaceMember"("roleId", "workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_roleId_workspaceId_fkey" FOREIGN KEY ("roleId", "workspaceId") REFERENCES "Role"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roleId_workspaceId_fkey" FOREIGN KEY ("roleId", "workspaceId") REFERENCES "Role"("id", "workspaceId") ON DELETE NO ACTION ON UPDATE RESTRICT;

COMMIT;
