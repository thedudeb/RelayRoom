-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "replayKey" TEXT NOT NULL,
    "eventId" TEXT,
    "signatureHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_replayKey_key" ON "WebhookEvent"("replayKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_expiresAt_idx" ON "WebhookEvent"("expiresAt");
