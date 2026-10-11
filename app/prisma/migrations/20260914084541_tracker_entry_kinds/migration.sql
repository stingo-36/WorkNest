-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('FollowUp', 'Task', 'Note');

-- DropIndex
DROP INDEX "FollowUp_userId_status_dueDate_idx";

-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "kind" "EntryKind" NOT NULL DEFAULT 'FollowUp',
ALTER COLUMN "person" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "FollowUp_userId_kind_idx" ON "FollowUp"("userId", "kind");

-- CreateIndex
CREATE INDEX "FollowUp_userId_kind_status_dueDate_idx" ON "FollowUp"("userId", "kind", "status", "dueDate");
