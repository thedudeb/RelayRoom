ALTER TABLE "Pipeline" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Pipeline_userId_archivedAt_idx" ON "Pipeline"("userId", "archivedAt");
