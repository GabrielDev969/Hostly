-- AuditLog tamper-evidence: each row carries the hash of the previous row
-- (prevHash) plus its own hash (hash, unique). Inserts are serialized via
-- pg_advisory_xact_lock so the chain can't fork under concurrency.
--
-- Existing rows have no chain. We add hash NOT NULL with a placeholder
-- per-row (their own id) so the migration is non-destructive; the chain
-- effectively begins at the first row inserted after this migration.

ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT;

UPDATE "AuditLog" SET "hash" = "id" WHERE "hash" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "hash" SET NOT NULL;
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");
