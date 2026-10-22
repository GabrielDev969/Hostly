-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: add organizationId as nullable for backfill
ALTER TABLE "Workspace" ADD COLUMN "organizationId" TEXT;

-- Backfill: one Organization per existing Workspace (1:1, same name/owner; slug prefixed to avoid collision in the Organization namespace if a future workspace coincidentally claims the same slug)
INSERT INTO "Organization" ("id", "name", "slug", "ownerId", "deletedAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text AS id,
    w."name",
    'org-' || w."slug" AS slug,
    w."ownerId",
    w."deletedAt",
    w."createdAt",
    NOW() AS "updatedAt"
FROM "Workspace" w;

-- Link each workspace to its newly-created org (matched by ownerId + slug suffix)
UPDATE "Workspace" w
SET "organizationId" = o."id"
FROM "Organization" o
WHERE o."slug" = 'org-' || w."slug" AND o."ownerId" = w."ownerId";

-- Enforce NOT NULL after backfill
ALTER TABLE "Workspace" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
