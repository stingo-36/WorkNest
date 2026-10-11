-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

