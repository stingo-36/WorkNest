-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "aiInputHash" TEXT,
ADD COLUMN     "titleGenerated" BOOLEAN NOT NULL DEFAULT false;
