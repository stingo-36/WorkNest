-- AlterEnum
ALTER TYPE "EntryKind" ADD VALUE 'Idea';

-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

