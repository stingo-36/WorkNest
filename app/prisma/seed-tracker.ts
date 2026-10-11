import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import type { EntryKind } from "../src/generated/prisma/enums";

/** A follow-up channel — free text from the user's list since 2026-10-01. */
type FollowUpChannel = string;

/**
 * Replace ONE account's Tracker entries with a realistic mix, dated relative
 * to today, so every part of the Tracker has something to show:
 * to-dos (overdue, today, upcoming, someday, done), follow-ups (waiting,
 * replied, closed) and notes.
 *
 *   npm run db:seed:tracker                      -> tariboi36@gmail.com
 *   npm run db:seed:tracker -- someone@mail.com  -> another existing account
 *   npm run db:seed:tracker -- someone@mail.com --append
 *       -> keep everything already there and ADD a second, different set
 *          (APPEND_ENTRIES) — for an account that has real entries.
 *
 * Only follow-ups / to-dos / notes for that account are touched —
 * work logs, tickets and every other account are left alone.
 */

const DEFAULT_EMAIL = "tariboi36@gmail.com";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Local calendar day `offset` days from today, as the UTC-midnight @db.Date value. */
function dueDay(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}
/** A local timestamp `daysAgo` days back at `hour:minute`. */
function at(daysAgo: number, hour: number, minute = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
}

type Seed = {
  kind: EntryKind;
  subject: string;
  person?: string;
  ticketKey?: string;
  /** Days from today; negative = overdue. Omit for no date. */
  due?: number;
  pinned?: boolean;
  /** Notes only. */
  tags?: string[];
  /** Days ago it was completed. */
  doneDaysAgo?: number;
  createdDaysAgo: number;
  /** Oldest first: [daysAgo, hour, channel, note, fromThem?]. */
  updates?: Array<[number, number, FollowUpChannel, string, boolean?]>;
};

const ENTRIES: Seed[] = [
  // --- Follow-ups -----------------------------------------------------------
  {
    kind: "FollowUp", subject: "Timebase notification SMTP credentials", person: "Ashwini", pinned: true, createdDaysAgo: 4,
    updates: [
      [4, 13, "Slack", "Shared the doc on configuring SMTP with Gmail and setting it up on the CMS sites."],
      [2, 11, "Slack", "Asked again for the credentials — checking with IT."],
    ],
  },
  {
    kind: "FollowUp", subject: "Sign-off on the versioned search endpoint", person: "Veritech QA", ticketKey: "VER-1440", due: 0, createdDaysAgo: 3,
    updates: [
      [3, 16, "Email", "Sent the load-test results and the partner-key test plan."],
      [1, 10, "Call", "They'll run the partner tests today and confirm by EOD.", true],
    ],
  },
  {
    kind: "FollowUp", subject: "Plus Alliance: contrib patch for the menu module", person: "Rahul", ticketKey: "24491", due: -2, createdDaysAgo: 5,
    updates: [[5, 15, "Teams", "Asked if they can apply the contrib patch on their side — waiting on a reply."]],
  },
  {
    kind: "FollowUp", subject: "Obs Studio QA feedback on the D11 sandbox", person: "Priya", ticketKey: "24488", due: 3, createdDaysAgo: 1,
    updates: [[1, 17, "Email", "Sent the sandbox link and the list of changed modules."]],
  },
  {
    kind: "FollowUp", subject: "Content approval for the ASUOCMS update", person: "Ashwini", ticketKey: "25542", doneDaysAgo: 3, createdDaysAgo: 8,
    updates: [
      [8, 12, "Slack", "Sent the preview link for the updated pages."],
      [3, 18, "Slack", "Approved — pushed to live.", true],
    ],
  },

  // --- Tasks ----------------------------------------------------------------
  { kind: "Task", subject: "Write release notes for the catalogue migration", ticketKey: "ASU-2101", due: 0, pinned: true, createdDaysAgo: 2,
    updates: [[1, 18, "Other", "Draft started — need the redirect list from the content team."]] },
  { kind: "Task", subject: "Review Siddharth's PR for the Quick Action Links module", ticketKey: "STC-315", due: -1, createdDaysAgo: 3 },
  { kind: "Task", subject: "Renew the staging SSL certificate", due: 5, createdDaysAgo: 6 },
  { kind: "Task", subject: "Prepare the sprint demo for Monday", due: 3, createdDaysAgo: 1 },
  { kind: "Task", subject: "Update my timesheet for this week", due: 1, createdDaysAgo: 0 },
  { kind: "Task", subject: "Set up PHPStan in the StartCMS pipeline", createdDaysAgo: 7,
    updates: [[6, 16, "Other", "Level 5 baseline generated; 38 issues to triage."]] },
  { kind: "Task", subject: "Clear the old Drupal 10 branches", doneDaysAgo: 2, createdDaysAgo: 9 },

  // --- Notes ----------------------------------------------------------------
  { kind: "Note", subject: "Staging deploy checklist", pinned: true, tags: ["deploy", "checklist"], createdDaysAgo: 10,
    updates: [[10, 11, "Other", "1. Put the site in maintenance mode\n2. drush deploy\n3. Clear CDN cache for changed paths\n4. Smoke-test login, search and checkout"]] },
  { kind: "Note", subject: "Ashwini said good job on the ASUOCMS release", tags: ["feedback"], createdDaysAgo: 3,
    updates: [[3, 18, "Other", "Worth mentioning in the sprint review."]] },
  { kind: "Note", subject: "Drupal 11 deprecations we keep hitting", tags: ["drupal"], createdDaysAgo: 6,
    updates: [[6, 14, "Other", "- drupal_set_message → messenger service\n- entity queries need accessCheck()\n- ${var} string interpolation in PHP 8.2+"]] },

  { kind: "Note", subject: "Auto-generate release notes from ticket updates", pinned: true, tags: ["automation"], createdDaysAgo: 2,
    updates: [[2, 20, "Other", "Pull every ticket moved to Released this sprint and group the notes by project."]] },
  { kind: "Note", subject: "Shared Drupal 11 upgrade checklist for all client sites", tags: ["drupal", "checklist"], createdDaysAgo: 5 },
  { kind: "Note", subject: "Weekly digest email of what I shipped", tags: ["automation"], createdDaysAgo: 1,
    updates: [[1, 21, "Other", "Could come straight from the work logs — meetings + tickets + learning."]] },
];

/** Added by `--append`: different subjects from ENTRIES, all open, so a lived-in
 *  account gets fresh to-dos, follow-ups and notes without losing anything. */
const APPEND_ENTRIES: Seed[] = [
  // --- Follow-ups -----------------------------------------------------------
  {
    kind: "FollowUp", subject: "Access to the Acquia staging environment", person: "Ravi", pinned: true, due: -1, createdDaysAgo: 4,
    updates: [
      [4, 11, "Slack", "Asked for SSH access to staging so I can run the config import."],
      [2, 15, "Slack", "Pinged again — he's waiting on approval from the client."],
    ],
  },
  {
    kind: "FollowUp", subject: "Final copy for the admissions landing page", person: "Meera", ticketKey: "ASU-2214", due: 2, createdDaysAgo: 2,
    updates: [[2, 10, "Email", "Sent the draft layout and asked for the final copy and hero image."]],
  },
  {
    kind: "FollowUp", subject: "Budget sign-off for the Drupal 11 upgrade", person: "Karan", createdDaysAgo: 5,
    updates: [
      [5, 14, "Meeting", "Walked through the estimate: 3 sprints, two client sites first."],
      [1, 17, "Email", "Approved for the first two sites — start next sprint.", true],
    ],
  },
  {
    kind: "FollowUp", subject: "Search API outage root cause", person: "Platform team", ticketKey: "OPS-982", createdDaysAgo: 3,
    updates: [
      [3, 9, "Teams", "Asked for the RCA on Monday's Solr outage."],
      [0, 11, "Teams", "Index rebuild hit a memory limit; they've raised it and added an alert.", true],
    ],
  },
  {
    kind: "FollowUp", subject: "Review of the accessibility audit fixes", person: "Neha", due: 4, createdDaysAgo: 1,
    updates: [[1, 16, "Slack", "Shared the list of 14 fixed issues and the test URLs."]],
  },

  // --- To-dos ---------------------------------------------------------------
  { kind: "Task", subject: "Fix the broken image styles after the media module update", ticketKey: "ASU-2230", due: -2, pinned: true, createdDaysAgo: 3,
    updates: [[2, 12, "Other", "Only happens for WebP — likely the toolkit config."]] },
  { kind: "Task", subject: "Write the handover doc for the events module", due: 0, createdDaysAgo: 2 },
  { kind: "Task", subject: "Reply to Ashwini's email about the content freeze", due: 0, createdDaysAgo: 0 },
  { kind: "Task", subject: "Upgrade the local DDEV setup to PHP 8.3", due: 2, createdDaysAgo: 1 },
  { kind: "Task", subject: "Book the sprint retro room", due: 5, createdDaysAgo: 1 },
  { kind: "Task", subject: "Clean up unused Composer packages in StartCMS", createdDaysAgo: 6 },
  { kind: "Task", subject: "Read the Drupal 11.1 release notes", createdDaysAgo: 4 },

  // --- Notes ----------------------------------------------------------------
  { kind: "Note", subject: "Useful Drush commands", pinned: true, tags: ["drupal", "commands"], createdDaysAgo: 8,
    updates: [
      [8, 10, "Other", "drush cr — clear caches\ndrush cim -y — import config\ndrush updb -y — run DB updates"],
      [3, 15, "Other", "drush ws --count=20 — last 20 watchdog log entries"],
    ] },
  { kind: "Note", subject: "1:1 with manager — 29 Sep", tags: ["meetings"], createdDaysAgo: 2,
    updates: [[2, 16, "Other", "- Take the lead on the D11 upgrade plan\n- Mentor Siddharth on code reviews\n- Look at the AWS certification budget"]] },
  { kind: "Note", subject: "Ideas for the team demo day", tags: ["meetings"], createdDaysAgo: 5,
    updates: [
      [5, 18, "Other", "Live-demo the config split workflow."],
      [1, 19, "Other", "Also show the before/after Lighthouse scores for the admissions site."],
    ] },
];

async function main() {
  const append = process.argv.includes("--append");
  const args = process.argv.slice(2).filter((arg) => arg !== "--append");
  const email = (args[0] ?? DEFAULT_EMAIL).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}`);
  const userId = user.id;

  if (append) {
    console.log(`appending to ${email} — existing tracker entries are kept`);
  } else {
    const [updates, entries] = await prisma.$transaction([
      prisma.followUpUpdate.deleteMany({ where: { userId } }),
      prisma.followUp.deleteMany({ where: { userId } }),
    ]);
    console.log(`cleared ${email}: ${entries.count} tracker entries, ${updates.count} records`);
  }

  const list = append ? APPEND_ENTRIES : ENTRIES;
  for (const seed of list) {
    const done = seed.doneDaysAgo !== undefined;
    const created = at(seed.createdDaysAgo, 9, 30);
    const last = seed.updates?.at(-1);
    await prisma.followUp.create({
      data: {
        userId,
        kind: seed.kind,
        subject: seed.subject,
        person: seed.person ?? null,
        ticketKey: seed.ticketKey ?? null,
        dueDate: seed.due === undefined ? null : dueDay(seed.due),
        pinned: seed.pinned ?? false,
        tags: seed.tags ?? [],
        status: done ? "Done" : "Open",
        completedAt: done ? at(seed.doneDaysAgo!, 18) : null,
        createdAt: created,
        updatedAt: last ? at(last[0], last[1]) : created,
        updates: {
          create: (seed.updates ?? []).map(([daysAgo, hour, channel, note, fromThem]) => ({
            userId,
            channel,
            note,
            fromThem: fromThem ?? false,
            occurredAt: at(daysAgo, hour),
            createdAt: at(daysAgo, hour),
          })),
        },
      },
    });
  }

  const count = (pred: (s: Seed) => boolean) => list.filter(pred).length;
  console.log(
    `added ${list.length}: ${count((s) => s.kind === "FollowUp")} follow-ups, ${count((s) => s.kind === "Task")} to-dos, ` +
      `${count((s) => s.kind === "Note")} notes · ` +
      `${count((s) => !!s.pinned)} important, ${count((s) => s.due !== undefined && s.due < 0 && s.doneDaysAgo === undefined)} overdue, ` +
      `${count((s) => s.due === 0)} due today, ${count((s) => (s.due ?? 0) > 0)} upcoming, ${count((s) => s.doneDaysAgo !== undefined)} done`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
