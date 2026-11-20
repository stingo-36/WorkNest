-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceMessageId" TEXT;

-- CreateTable
CREATE TABLE "GmailConnection" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Drupal Daily',
    "resourceType" TEXT NOT NULL DEFAULT 'Drupal',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GmailImport" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "added" INTEGER NOT NULL DEFAULT 0,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmailImport_pkey" PRIMARY KEY ("userId","messageId")
);

-- CreateIndex
CREATE INDEX "GmailImport_userId_importedAt_idx" ON "GmailImport"("userId", "importedAt");

-- CreateIndex
CREATE INDEX "Resource_userId_sourceMessageId_idx" ON "Resource"("userId", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailImport" ADD CONSTRAINT "GmailImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
