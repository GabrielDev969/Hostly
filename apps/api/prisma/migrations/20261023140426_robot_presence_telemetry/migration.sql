-- Hostly robot presence and telemetry: last state on Robot and the TelemetrySnapshot history.
-- CreateEnum
CREATE TYPE "RobotMode" AS ENUM ('idle', 'promotion', 'cruise', 'guide', 'reception', 'base', 'suspended');

-- AlterTable
ALTER TABLE "Robot" ADD COLUMN     "battery" INTEGER,
ADD COLUMN     "charging" BOOLEAN,
ADD COLUMN     "emergency" BOOLEAN,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "manifestVersion" TEXT,
ADD COLUMN     "mode" "RobotMode",
ADD COLUMN     "nowPlayingAssetId" TEXT,
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "poseTheta" DOUBLE PRECISION,
ADD COLUMN     "poseX" DOUBLE PRECISION,
ADD COLUMN     "poseY" DOUBLE PRECISION,
ADD COLUMN     "telemetryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TelemetrySnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "battery" INTEGER,
    "charging" BOOLEAN,
    "poseX" DOUBLE PRECISION,
    "poseY" DOUBLE PRECISION,
    "poseTheta" DOUBLE PRECISION,
    "mode" "RobotMode" NOT NULL,
    "emergency" BOOLEAN NOT NULL,

    CONSTRAINT "TelemetrySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Robot_id_organizationId_key" ON "Robot"("id", "organizationId");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_organizationId_idx" ON "TelemetrySnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_clientId_idx" ON "TelemetrySnapshot"("clientId");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_robotId_ts_idx" ON "TelemetrySnapshot"("robotId", "ts");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_ts_idx" ON "TelemetrySnapshot"("ts");

-- AddForeignKey
ALTER TABLE "TelemetrySnapshot" ADD CONSTRAINT "TelemetrySnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySnapshot" ADD CONSTRAINT "TelemetrySnapshot_clientId_organizationId_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySnapshot" ADD CONSTRAINT "TelemetrySnapshot_robotId_organizationId_fkey" FOREIGN KEY ("robotId", "organizationId") REFERENCES "Robot"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Battery is a percentage and the pose comes whole or not at all, on the last state and in the history.
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_battery_percent" CHECK ("battery" BETWEEN 0 AND 100);
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_pose_all_or_none" CHECK (("poseX" IS NULL) = ("poseY" IS NULL) AND ("poseX" IS NULL) = ("poseTheta" IS NULL));
ALTER TABLE "TelemetrySnapshot" ADD CONSTRAINT "TelemetrySnapshot_battery_percent" CHECK ("battery" BETWEEN 0 AND 100);
ALTER TABLE "TelemetrySnapshot" ADD CONSTRAINT "TelemetrySnapshot_pose_all_or_none" CHECK (("poseX" IS NULL) = ("poseY" IS NULL) AND ("poseX" IS NULL) = ("poseTheta" IS NULL));
