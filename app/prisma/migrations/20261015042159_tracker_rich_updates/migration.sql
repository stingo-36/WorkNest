-- AlterTable
ALTER TABLE "FollowUpUpdate" ADD COLUMN     "doc" JSONB;

-- CreateTable
CREATE TABLE "FollowUpFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "followUpId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpFile_userId_idx" ON "FollowUpFile"("userId");

-- CreateIndex
CREATE INDEX "FollowUpFile_followUpId_idx" ON "FollowUpFile"("followUpId");

-- AddForeignKey
ALTER TABLE "FollowUpFile" ADD CONSTRAINT "FollowUpFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpFile" ADD CONSTRAINT "FollowUpFile_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
