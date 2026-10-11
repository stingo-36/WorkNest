import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { EntryKind, TicketStatus } from "../src/generated/prisma/enums";

/**
 * Top up the CURRENT sprint.
 *
 * `seed-bulk.ts` backfills ten weeks ending on the day it was run, so a few
 * days after running it the dashboard's Today card and sprint counters are
 * empty again. This fills the trailing gap — weekdays only, today included —
 * without touching a single existing row.
 *
 *   npm run db:seed:fill                          -> demo@workspace.local, 5 days
 *   npm run db:seed:fill -- you@example.com       -> a different account
 *   npm run db:seed:fill -- you@example.com 10    -> a longer window
 *
 * Additive and idempotent:
 *   - a date with a work log that has content (ticket work or Work done notes)
 *     is skipped entirely
 *   - a date with an EMPTY log (auto-created by opening the day) is topped up:
 *     blank meeting notes and ticket work are filled; nothing is overwritten
 *   - ticket updates are upserted on (ticketId, workLogId)
 *   - a ticket's stage only ever moves FORWARD. `seed-bulk` restarts its arcs
 *     from step 0 on every run, which can walk a Released ticket back to
 *     InProgress; this reads each ticket's real current stage first.
 */

const DEFAULT_EMAIL = "demo@workspace.local";
const DEFAULT_DAYS = 5;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * UTC midnight of the LOCAL calendar day, n days back.
 *
 * Must read LOCAL components, not UTC ones — `src/lib/dashboard.ts` and
 * `src/lib/worklogs.ts` both key work logs on `Date.UTC(getFullYear(),
 * getMonth(), getDate())`. `seed-bulk.ts` uses getUTC* here, so when it runs
 * at a local time that is still "yesterday" in UTC (any evening east of
 * Greenwich) its "today" lands a day early and the dashboard's Today card
 * stays empty. That is the bug this helper deliberately does not copy.
 */
function daysAgo(n: number): Date {
  const now = new Date();
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(day - n * 86_400_000);
}
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Deterministic, so re-runs and reviews see the same text. */
let seed = 20260916;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const chance = (p: number) => rnd() < p;

const MEETINGS = ["ASU Sync-up", "Veritech Sync-up", "Client Sync-up", "Others"] as const;

const NOTES: Record<string, readonly string[]> = {
  "ASU Sync-up": [
    "Sprint opened. Carry-over from last sprint is the retry config and the export route.",
    "Board groomed. Two tickets split because the QA surface was too wide to test in one pass.",
    "Standup only — nothing blocking. Reviewed the three PRs waiting on me.",
  ],
  "Veritech Sync-up": [
    "Walked the versioned endpoint. They keep v1 alive until we confirm no callers remain.",
    "Agreed the contract change lands behind a flag so their QA can opt in early.",
    "",
  ],
  "Client Sync-up": [
    "Demoed the streaming export. They asked for totals on the first row, not the last.",
    "Raised the reconciliation timing question. They will confirm the cut-off with finance.",
    "",
  ],
  Others: [
    "Spent the afternoon on the flaky auth redirect. Root cause is a stale cookie domain.",
    "Paired on the invoice rounding fix and wrote the follow-up ticket.",
    "",
  ],
};

/** Forward-only five-stage workflow, matching src/lib/workflow-status.ts. */
const STAGES = [
  TicketStatus.InProgress,
  TicketStatus.SentToQA,
  TicketStatus.ReadyForProduction,
  TicketStatus.Released,
  TicketStatus.Done,
] as const;

function stageIndex(stored: string): number {
  switch (stored) {
    case "Open":
    case "InProgress":
      return 0;
    case "Blocked":
    case "Waiting":
    case "SentToQA":
      return 1;
    case "Testing":
    case "ReadyForProduction":
      return 2;
    case "Completed":
    case "Released":
      return 3;
    case "Closed":
    case "Done":
      return 4;
    default:
      return 0;
  }
}

const WORK_BY_STAGE: Record<string, readonly string[]> = {
  InProgress: [
    "Wired the retry config behind the feature flag. Local runs are clean; needs a staging pass.",
    "Split the export query so the totals row is computed before the stream opens.",
    "Traced the redirect loop to a stale cookie domain. Fix is in, writing the regression case.",
  ],
  SentToQA: [
    "Moved to QA. Attached the staging build and the reproduction steps.",
    "Handed to QA with the staging link and the three cases that used to fail.",
    "Sent over for testing. Flagged the timezone edge case so they check it explicitly.",
  ],
  ReadyForProduction: [
    "Sign-off in. Sitting in the release queue behind the config change.",
    "QA signed off. Queued for the Thursday deploy window.",
    "Green on staging all day. Ready to ship, release notes drafted.",
  ],
  Released: [
    "Deployed. Smoke-checked the export and the totals row against live data.",
    "Shipped in the evening window. Watching error rates, nothing unusual so far.",
    "Live. Confirmed the totals row renders correctly against production data.",
  ],
  Done: [
    "Wrapped. Nothing outstanding, the remaining scope moved to its own ticket.",
    "Closed out. Follow-up for the 'remember this device' option is its own ticket now.",
    "Done — verified in production and the client confirmed on the call.",
  ],
};

const TRACKER_SEEDS = [
  {
    kind: EntryKind.FollowUp,
    person: "Ashwini",
    subject: "Confirm the staging deploy window for the export change",
    ticketKey: "ASU-1234",
    dueOffset: 0,
  },
  {
    kind: EntryKind.FollowUp,
    person: "Veritech QA",
    subject: "Chase the sign-off on the versioned endpoint",
    ticketKey: "VER-2456",
    dueOffset: 1,
  },
  {
    kind: EntryKind.Task,
    person: null,
    subject: "Write the release notes for this sprint",
    ticketKey: null,
    dueOffset: 2,
  },
  {
    kind: EntryKind.Note,
    person: null,
    subject: "Finance wants the reconciliation cut-off moved to the 25th",
    ticketKey: null,
    dueOffset: null,
  },
] as const;

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase().trim();
  const days = Number(process.argv[3] ?? DEFAULT_DAYS);
  if (!Number.isFinite(days) || days < 1 || days > 60) {
    throw new Error(`days must be between 1 and 60, got "${process.argv[3]}"`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Deliberately does NOT create the account: this script tops up an
    // existing workspace. Use `db:seed` or `db:seed:bulk` to create one.
    throw new Error(`no account for ${email} — run "npm run db:seed:bulk" first`);
  }
  const userId = user.id;
  console.log(`topping up  ${email}  (last ${days} days, weekdays only)`);

  const tickets = await prisma.ticket.findMany({
    where: { userId },
    select: { id: true, ticketId: true, status: true },
    orderBy: { updatedAt: "desc" },
  });
  if (tickets.length === 0) {
    throw new Error(`${email} has no tickets — run "npm run db:seed:bulk" first`);
  }
  const stage = new Map(tickets.map((t) => [t.id, stageIndex(t.status)]));
  /** How many lines we have written per stage, to rotate through them. */
  const lineIndex = new Map<string, number>();

  let createdLogs = 0;
  let createdUpdates = 0;
  let skipped = 0;
  let toppedUp = 0;

  for (let d = days - 1; d >= 0; d--) {
    const date = daysAgo(d);
    if (isWeekend(date)) continue;

    const existing = await prisma.workLog.findUnique({
      where: { userId_date: { userId, date } },
      select: { id: true, learningNotes: true, _count: { select: { ticketUpdates: true } } },
    });
    if (existing && (existing._count.ticketUpdates > 0 || existing.learningNotes.trim())) {
      skipped++;
      continue;
    }

    if (existing) {
      // Fill only the blank meeting cards; never overwrite what's there.
      const blank = await prisma.meeting.findMany({ where: { workLogId: existing.id, notes: "" }, select: { id: true, name: true } });
      for (const meeting of blank) {
        const pool = NOTES[meeting.name as keyof typeof NOTES];
        if (pool && chance(0.75)) await prisma.meeting.update({ where: { id: meeting.id }, data: { notes: pick(pool) } });
      }
      toppedUp++;
    }

    const workLog = existing ?? await prisma.workLog.create({
      data: {
        userId,
        title: "Daily Work Log",
        date,
        createdAt: atHour(date, 9),
        updatedAt: atHour(date, 18),
        meetings: {
          create: MEETINGS.map((name, order) => ({
            name,
            order,
            isDefault: true,
            notes: chance(0.75) ? pick(NOTES[name]!) : "",
          })),
        },
      },
    });
    if (!existing) createdLogs++;

    // 2-3 tickets touched, each moving forward at most one stage.
    const touched = new Set<string>();
    const want = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < want; i++) {
      const t = pick(tickets);
      if (touched.has(t.id)) continue;
      touched.add(t.id);

      const current = stage.get(t.id) ?? 0;
      const next = current < STAGES.length - 1 && chance(0.5) ? current + 1 : current;
      const status = STAGES[next]!;
      stage.set(t.id, next);

      // Rotate per STAGE across the whole run, not per (ticket, stage).
      // Keyed per ticket, every ticket started at index 0, so three different
      // tickets reaching "Released" all drew the same sentence — the Recent
      // ticket work list showed the same line three times.
      const lineKey = status;
      const seen = lineIndex.get(lineKey) ?? 0;
      lineIndex.set(lineKey, seen + 1);
      const lines = WORK_BY_STAGE[status]!;

      await prisma.ticketWorkUpdate.upsert({
        where: { ticketId_workLogId: { ticketId: t.id, workLogId: workLog.id } },
        update: {},
        create: {
          ticketId: t.id,
          workLogId: workLog.id,
          userId,
          description: lines[seen % lines.length]!,
          status,
          createdAt: atHour(date, 11 + i * 2),
          updatedAt: atHour(date, 11 + i * 2),
        },
      });
      createdUpdates++;

      await prisma.ticket.update({ where: { id: t.id }, data: { status } });
    }

    console.log(`  ${iso(date)}  ${existing ? "empty log topped up" : "log"} + ${touched.size} ticket updates`);
  }

  // ---- tracker entries ----------------------------------------------------
  let createdEntries = 0;
  for (const s of TRACKER_SEEDS) {
    const exists = await prisma.followUp.findFirst({
      where: { userId, subject: s.subject },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.followUp.create({
      data: {
        userId,
        kind: s.kind,
        person: s.person,
        subject: s.subject,
        ticketKey: s.ticketKey,
        dueDate: s.dueOffset === null ? null : daysAgo(-s.dueOffset),
      },
    });
    createdEntries++;
  }

  console.log(
    `\ndone — ${createdLogs} work logs, ${toppedUp} empty logs topped up, ${createdUpdates} ticket updates, ` +
      `${createdEntries} tracker entries` +
      (skipped ? ` (${skipped} date${skipped > 1 ? "s" : ""} already had a log)` : ""),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
