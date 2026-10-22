-- All existing invitations are dropped: pending ones had only plaintext tokens
-- (irrecoverable as sha256) and accepted ones already produced their
-- WorkspaceMember, so the row is no longer load-bearing.
DELETE FROM "Invitation";

DROP INDEX IF EXISTS "Invitation_token_idx";
DROP INDEX IF EXISTS "Invitation_token_key";
ALTER TABLE "Invitation" DROP COLUMN "token";
ALTER TABLE "Invitation" ADD COLUMN "tokenHash" TEXT NOT NULL;
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
