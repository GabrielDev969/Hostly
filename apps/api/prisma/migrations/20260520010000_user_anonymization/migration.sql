ALTER TABLE "User" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE INDEX "User_anonymizedAt_idx" ON "User"("anonymizedAt");
