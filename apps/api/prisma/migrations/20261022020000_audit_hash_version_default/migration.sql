-- New rows hash with version 2; a row that omits hashVersion must not pass as legacy version 1.
ALTER TABLE "AuditLog" ALTER COLUMN "hashVersion" SET DEFAULT 2;
