-- CreateTable
CREATE TABLE "MeetingMinutesLink" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutesLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingMinutesLink_followUpId_idx" ON "MeetingMinutesLink"("followUpId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingMinutesLink_meetingId_followUpId_key" ON "MeetingMinutesLink"("meetingId", "followUpId");

-- AddForeignKey
ALTER TABLE "MeetingMinutesLink" ADD CONSTRAINT "MeetingMinutesLink_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinutesLink" ADD CONSTRAINT "MeetingMinutesLink_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
