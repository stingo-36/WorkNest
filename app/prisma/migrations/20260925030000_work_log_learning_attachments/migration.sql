-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('File', 'Link');

-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "learningNotes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "WorkLogAttachment" (
    "id" TEXT NOT NULL,
    "workLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "data" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkLogAttachment_workLogId_idx" ON "WorkLogAttachment"("workLogId");

-- CreateIndex
CREATE INDEX "WorkLogAttachment_userId_idx" ON "WorkLogAttachment"("userId");

-- AddForeignKey
ALTER TABLE "WorkLogAttachment" ADD CONSTRAINT "WorkLogAttachment_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "WorkLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLogAttachment" ADD CONSTRAINT "WorkLogAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

