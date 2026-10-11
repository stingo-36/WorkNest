-- CreateEnum
CREATE TYPE "FollowUpChannel" AS ENUM ('Slack', 'Email', 'Call', 'Meeting', 'Teams', 'InPerson', 'Other');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('Open', 'Done');

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "ticketKey" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'Open',
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpUpdate" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "channel" "FollowUpChannel" NOT NULL DEFAULT 'Slack',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUp_userId_idx" ON "FollowUp"("userId");

-- CreateIndex
CREATE INDEX "FollowUp_userId_status_idx" ON "FollowUp"("userId", "status");

-- CreateIndex
CREATE INDEX "FollowUp_userId_status_dueDate_idx" ON "FollowUp"("userId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "FollowUp_userId_person_idx" ON "FollowUp"("userId", "person");

-- CreateIndex
CREATE INDEX "FollowUp_userId_updatedAt_idx" ON "FollowUp"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "FollowUpUpdate_userId_idx" ON "FollowUpUpdate"("userId");

-- CreateIndex
CREATE INDEX "FollowUpUpdate_followUpId_idx" ON "FollowUpUpdate"("followUpId");

-- CreateIndex
CREATE INDEX "FollowUpUpdate_followUpId_occurredAt_idx" ON "FollowUpUpdate"("followUpId", "occurredAt");

-- CreateIndex
CREATE INDEX "FollowUpUpdate_userId_occurredAt_idx" ON "FollowUpUpdate"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpUpdate" ADD CONSTRAINT "FollowUpUpdate_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpUpdate" ADD CONSTRAINT "FollowUpUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
