CREATE TABLE "NotificationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "queueItemId" TEXT,
    "type" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL,
    "reason" TEXT,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationDeliveryAttempt_userId_createdAt_idx" ON "NotificationDeliveryAttempt"("userId", "createdAt");
CREATE INDEX "NotificationDeliveryAttempt_queueItemId_createdAt_idx" ON "NotificationDeliveryAttempt"("queueItemId", "createdAt");

ALTER TABLE "NotificationDeliveryAttempt"
ADD CONSTRAINT "NotificationDeliveryAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryAttempt"
ADD CONSTRAINT "NotificationDeliveryAttempt_queueItemId_fkey"
FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
