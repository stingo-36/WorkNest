/*
  Warnings:

  - You are about to drop the column `content` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the column `pinned` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Note` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Note_userId_pinned_idx";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "content",
DROP COLUMN "pinned",
DROP COLUMN "tags",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iconLibrary" TEXT,
ADD COLUMN     "iconName" TEXT;

-- CreateTable
CREATE TABLE "NoteSection" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotePage" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteSection_noteId_idx" ON "NoteSection"("noteId");

-- CreateIndex
CREATE INDEX "NoteSection_noteId_order_idx" ON "NoteSection"("noteId", "order");

-- CreateIndex
CREATE INDEX "NotePage_sectionId_idx" ON "NotePage"("sectionId");

-- CreateIndex
CREATE INDEX "NotePage_sectionId_order_idx" ON "NotePage"("sectionId", "order");

-- CreateIndex
CREATE INDEX "Note_userId_deletedAt_idx" ON "Note"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Note_userId_favorite_idx" ON "Note"("userId", "favorite");

-- AddForeignKey
ALTER TABLE "NoteSection" ADD CONSTRAINT "NoteSection_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePage" ADD CONSTRAINT "NotePage_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "NoteSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
