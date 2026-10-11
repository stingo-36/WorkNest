-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "favorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sprintLengthDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "sprintStartDate" DATE,
ADD COLUMN     "ticketsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Resource_userId_favorite_idx" ON "Resource"("userId", "favorite");
