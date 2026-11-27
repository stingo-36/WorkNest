-- CreateTable
CREATE TABLE "FollowUpUpdateRevision" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "doc" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpUpdateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpUpdateRevision_updateId_createdAt_idx" ON "FollowUpUpdateRevision"("updateId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpUpdateRevision_userId_idx" ON "FollowUpUpdateRevision"("userId");

-- AddForeignKey
ALTER TABLE "FollowUpUpdateRevision" ADD CONSTRAINT "FollowUpUpdateRevision_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "FollowUpUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpUpdateRevision" ADD CONSTRAINT "FollowUpUpdateRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
