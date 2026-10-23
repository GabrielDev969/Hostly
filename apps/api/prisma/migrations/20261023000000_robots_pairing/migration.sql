-- Hostly robots and pairing: Robot (composite foreign key to its site, client and organization) and RobotPairing.
-- CreateEnum
CREATE TYPE "RobotModel" AS ENUM ('luckibot_plus');

-- CreateEnum
CREATE TYPE "RobotStatus" AS ENUM ('pending', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "RobotPairingStatus" AS ENUM ('pending', 'approved');

-- CreateTable
CREATE TABLE "Robot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "model" "RobotModel" NOT NULL DEFAULT 'luckibot_plus',
    "name" TEXT NOT NULL,
    "romVersion" TEXT,
    "appVersion" TEXT,
    "status" "RobotStatus" NOT NULL DEFAULT 'pending',
    "deviceTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Robot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotPairing" (
    "id" TEXT NOT NULL,
    "pollKeyHash" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RobotPairingStatus" NOT NULL DEFAULT 'pending',
    "robotId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RobotPairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Robot_serial_key" ON "Robot"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "Robot_deviceTokenHash_key" ON "Robot"("deviceTokenHash");

-- CreateIndex
CREATE INDEX "Robot_organizationId_idx" ON "Robot"("organizationId");

-- CreateIndex
CREATE INDEX "Robot_clientId_idx" ON "Robot"("clientId");

-- CreateIndex
CREATE INDEX "Robot_siteId_idx" ON "Robot"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "RobotPairing_pollKeyHash_key" ON "RobotPairing"("pollKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "RobotPairing_code_key" ON "RobotPairing"("code");

-- CreateIndex
CREATE INDEX "RobotPairing_expiresAt_idx" ON "RobotPairing"("expiresAt");

-- CreateIndex
CREATE INDEX "RobotPairing_robotId_idx" ON "RobotPairing"("robotId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_id_clientId_organizationId_key" ON "Site"("id", "clientId", "organizationId");

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_siteId_clientId_organizationId_fkey" FOREIGN KEY ("siteId", "clientId", "organizationId") REFERENCES "Site"("id", "clientId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotPairing" ADD CONSTRAINT "RobotPairing_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A robot holds a device token exactly while it is active: pending robots have none yet, revoked ones lost it.
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_token_iff_active" CHECK (("status" = 'active') = ("deviceTokenHash" IS NOT NULL));

-- A pairing points to a robot exactly once it is approved.
ALTER TABLE "RobotPairing" ADD CONSTRAINT "RobotPairing_robot_iff_approved" CHECK (("status" = 'approved') = ("robotId" IS NOT NULL));
