-- AlterTable
ALTER TABLE "Pipeline"
    ADD COLUMN "driveChannelId" TEXT,
    ADD COLUMN "driveChannelResourceId" TEXT,
    ADD COLUMN "driveChannelToken" TEXT,
    ADD COLUMN "driveChannelExpiresAt" TIMESTAMP(3);

-- Channel id is globally unique per Google docs; surface as a unique constraint
-- so accidental duplicate subscriptions surface immediately.
CREATE UNIQUE INDEX "Pipeline_driveChannelId_key" ON "Pipeline"("driveChannelId");
CREATE INDEX "Pipeline_driveChannelExpiresAt_idx" ON "Pipeline"("driveChannelExpiresAt");
