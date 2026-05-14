-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'OWNER');

-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('DRIVE', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERRORED');

-- CreateEnum
CREATE TYPE "PipelineMode" AS ENUM ('AUTO', 'MANUAL_APPROVAL');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('ENABLED', 'DISABLED', 'ERRORED');

-- CreateEnum
CREATE TYPE "PrivacyStatus" AS ENUM ('UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('DETECTED', 'NEEDS_ROUTING', 'NEEDS_APPROVAL', 'UPLOADING', 'UPLOADED', 'FAILED', 'SKIPPED', 'EXTERNALLY_HANDLED');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('QUOTA_EXCEEDED', 'AUTH_REVOKED', 'PLAYLIST_DELETED', 'FILE_NOT_FOUND', 'FILE_TOO_LARGE', 'NOT_VIDEO', 'RATE_LIMITED', 'NETWORK_TIMEOUT', 'VALIDATION_ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "channelId" TEXT,
    "channelName" TEXT,
    "channelHandle" TEXT,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "errorMessage" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driveConnectionId" TEXT NOT NULL,
    "youtubeConnectionId" TEXT NOT NULL,
    "sourceFolderId" TEXT NOT NULL,
    "sourceFolderName" TEXT NOT NULL,
    "destinationChannelName" TEXT NOT NULL,
    "mode" "PipelineMode" NOT NULL DEFAULT 'AUTO',
    "status" "PipelineStatus" NOT NULL DEFAULT 'DISABLED',
    "privacyStatus" "PrivacyStatus" NOT NULL DEFAULT 'UNLISTED',
    "pollingIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "processedFromTime" TIMESTAMP(3),
    "lastDetectionAt" TIMESTAMP(3),
    "defaultTitleTemplate" TEXT NOT NULL,
    "defaultDescriptionTemplate" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "conditionTree" JSONB NOT NULL,
    "youtubePlaylistId" TEXT NOT NULL,
    "youtubePlaylistName" TEXT NOT NULL,
    "titleTemplateOverride" TEXT,
    "descriptionTemplateOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "driveCreatedTime" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QueueStatus" NOT NULL,
    "previousStatus" "QueueStatus",
    "matchedRuleId" TEXT,
    "matchedRuleName" TEXT,
    "intendedPlaylistId" TEXT,
    "intendedPlaylistName" TEXT,
    "renderedTitle" TEXT,
    "renderedDescription" TEXT,
    "ruleEvaluationTrace" JSONB,
    "youtubeVideoId" TEXT,
    "youtubePlaylistId" TEXT,
    "youtubeUrl" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "failureReason" "FailureReason",
    "lastError" TEXT,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadAttempt" (
    "id" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" "FailureReason",
    "rawError" TEXT,
    "youtubeVideoId" TEXT,

    CONSTRAINT "UploadAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLogEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "queueItemId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "OAuthConnection_userId_kind_status_idx" ON "OAuthConnection"("userId", "kind", "status");

-- CreateIndex
CREATE INDEX "Pipeline_userId_status_idx" ON "Pipeline"("userId", "status");

-- CreateIndex
CREATE INDEX "Pipeline_sourceFolderId_idx" ON "Pipeline"("sourceFolderId");

-- CreateIndex
CREATE INDEX "Rule_pipelineId_idx" ON "Rule"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_pipelineId_priority_key" ON "Rule"("pipelineId", "priority");

-- CreateIndex
CREATE INDEX "QueueItem_userId_status_detectedAt_idx" ON "QueueItem"("userId", "status", "detectedAt");

-- CreateIndex
CREATE INDEX "QueueItem_pipelineId_status_idx" ON "QueueItem"("pipelineId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_pipelineId_driveFileId_key" ON "QueueItem"("pipelineId", "driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadAttempt_queueItemId_attemptNumber_key" ON "UploadAttempt"("queueItemId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ActivityLogEntry_queueItemId_createdAt_idx" ON "ActivityLogEntry"("queueItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_driveConnectionId_fkey" FOREIGN KEY ("driveConnectionId") REFERENCES "OAuthConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_youtubeConnectionId_fkey" FOREIGN KEY ("youtubeConnectionId") REFERENCES "OAuthConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadAttempt" ADD CONSTRAINT "UploadAttempt_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
