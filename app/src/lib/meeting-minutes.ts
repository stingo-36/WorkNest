import "server-only";

import { EntryKind } from "@/generated/prisma/enums";
import { createFollowUp } from "@/lib/follow-ups";
import { prisma } from "@/lib/prisma";
import { touchWorkLog } from "@/lib/worklogs";

/**
 * Minutes of meeting (MoM). The minutes themselves are Tracker Notes — title,
 * rich body, tags — tagged `mom`; a work-log meeting card only links to them
 * (`MeetingMinutesLink`). One MoM can be linked from several days' meetings.
 *
 * Both ends are checked against the session user before a link is written, so
 * a link can never join someone else's meeting or note.
 */

/** The tag every MoM written from a meeting card gets, and the picker sorts by. */
export const MOM_TAG = "mom";

const LINKED_SELECT = { id: true, subject: true, tags: true, archivedAt: true } as const;

export type LinkedMinutes = { id: string; subject: string; tags: string[]; archivedAt: Date | null };

function ownedMeeting(userId: string, meetingId: string) {
  return prisma.meeting.findFirst({
    where: { id: meetingId, workLog: { userId } },
    select: { id: true, workLogId: true },
  });
}

/** Notes the user can link: MoM-tagged first, then the most recently touched. */
export async function listMinutesCandidates(userId: string) {
  const notes = await prisma.followUp.findMany({
    where: { userId, kind: EntryKind.Note },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { ...LINKED_SELECT, updatedAt: true },
  });
  return notes.sort((a, b) => Number(b.tags.includes(MOM_TAG)) - Number(a.tags.includes(MOM_TAG)));
}

/** Link an existing Note as this meeting's minutes. Linking twice is a no-op. */
export async function linkMeetingMinutes(userId: string, meetingId: string, followUpId: string) {
  const [meeting, note] = await Promise.all([
    ownedMeeting(userId, meetingId),
    prisma.followUp.findFirst({ where: { id: followUpId, userId, kind: EntryKind.Note }, select: LINKED_SELECT }),
  ]);
  if (!meeting || !note) return null;

  await prisma.meetingMinutesLink.upsert({
    where: { meetingId_followUpId: { meetingId, followUpId } },
    create: { meetingId, followUpId },
    update: {},
  });
  await touchWorkLog(meeting.workLogId);
  return note;
}

/** Write a new MoM (a Tracker Note tagged `mom`) and link it to the meeting. */
export async function createMeetingMinutes(
  userId: string,
  meetingId: string,
  input: { subject: string; doc?: unknown; tags?: string[] },
) {
  const meeting = await ownedMeeting(userId, meetingId);
  if (!meeting) return null;

  const created = await createFollowUp(userId, {
    kind: EntryKind.Note,
    subject: input.subject,
    doc: input.doc,
    tags: [MOM_TAG, ...(input.tags ?? [])],
  });
  await prisma.meetingMinutesLink.create({ data: { meetingId, followUpId: created.id } });
  await touchWorkLog(meeting.workLogId);
  return { id: created.id, subject: created.subject, tags: created.tags, archivedAt: created.archivedAt } satisfies LinkedMinutes;
}

/** Remove the link only — the minutes stay in the Tracker. */
export async function unlinkMeetingMinutes(userId: string, meetingId: string, followUpId: string) {
  const meeting = await ownedMeeting(userId, meetingId);
  if (!meeting) return false;
  const removed = await prisma.meetingMinutesLink.deleteMany({
    where: { meetingId, followUpId, followUp: { userId } },
  });
  if (removed.count > 0) await touchWorkLog(meeting.workLogId);
  return removed.count > 0;
}
