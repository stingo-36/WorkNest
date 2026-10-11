import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import type { TicketStatus } from "../src/generated/prisma/enums";

/**
 * Reset ONE account's content and fill the CURRENT sprint with realistic work
 * logs + tickets (nothing else — no tracker, notes, resources).
 *
 *   npm run db:seed:sprint                      -> tariboi36@gmail.com
 *   npm run db:seed:sprint -- someone@mail.com  -> another existing account
 *
 * The account itself (login, password) is kept. Every other user is untouched.
 * Only weekdays from the sprint start up to TODAY are logged — never the future.
 */

const DEFAULT_EMAIL = "tariboi36@gmail.com";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Sprint calendar — must match src/lib/sprint.ts (anchor 2 Sep 2026, 14 days, local days). */
const SPRINT_ANCHOR = new Date(2026, 8, 2);
const SPRINT_DAYS = 14;

function localMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
/** Work logs are keyed on UTC midnight of the LOCAL calendar day. */
function toLogDate(local: Date) {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}
function atLocal(local: Date, hour: number, minute = 0) {
  return new Date(local.getFullYear(), local.getMonth(), local.getDate(), hour, minute);
}

type Status = Extract<TicketStatus, "InProgress" | "SentToQA" | "ReadyForProduction" | "Released" | "Done">;

const TICKETS: Array<{ key: string; title: string; project: string }> = [
  { key: "ASU-2101", title: "Migrate the ASU Online course catalogue to Drupal 11", project: "ASU Online" },
  { key: "ASU-2108", title: "Fix broken breadcrumbs on degree search pages", project: "ASU Online" },
  { key: "25542", title: "Update content in ASUOCMS", project: "AsuoCMS" },
  { key: "STC-315", title: "Custom module — Quick Action Links", project: "StartCMS" },
  { key: "STC-322", title: "Accessibility pass on the enrolment form", project: "StartCMS" },
  { key: "VER-1440", title: "Rate-limit the public search API", project: "Veritech" },
  { key: "VER-1452", title: "Upgrade PHP to 8.3 on staging", project: "Veritech" },
  { key: "24488", title: "Make custom modules and themes compatible with Drupal 11: Obs Studio", project: "Obs Studio" },
  { key: "24491", title: "Make custom modules and themes compatible with Drupal 11: Plus Alliance", project: "Plus Alliance" },
];

type Day = {
  title: string;
  meetings: [asu: string, veritech: string, client: string, others: string];
  updates: Array<[key: string, status: Status, text: string]>;
};

/** One entry per sprint weekday, in order. Only the days up to today are used. */
const DAYS: Day[] = [
  {
    title: "Sprint kickoff & Drupal 11 audit",
    meetings: [
      "- Sprint planning: committed to the course catalogue migration (ASU-2101) and the breadcrumb fix (ASU-2108).\n- Carry-over: content update for ASUOCMS (25542).",
      "- Walked through the search API load numbers. Agreed a rate limit is needed before the marketing launch.",
      "- Kickoff with Obs Studio and Plus Alliance on the Drupal 11 compatibility work.",
      "",
    ],
    updates: [
      ["ASU-2101", "InProgress", "- Audited 42 catalogue content types against Drupal 11 core.\n- Listed 6 contrib modules that still need D11 releases."],
      ["25542", "InProgress", "- Pulled the content change list from the ticket.\n- Updated the first 12 pages in the ASUOCMS **dev** environment."],
      ["24488", "InProgress", "- Ran `upgrade_status` on the Obs Studio codebase — 23 deprecations in custom modules."],
    ],
  },
  {
    title: "Catalogue migration & breadcrumb investigation",
    meetings: [
      "- ASU-2101: migration map for course fields agreed.\n- ASU-2108: breadcrumbs break only on filtered search URLs.",
      "- VER-1452: staging PHP 8.3 upgrade approved for this sprint.",
      "",
      "- 1:1 with Ashwini — priorities confirmed for the week.",
    ],
    updates: [
      ["ASU-2101", "InProgress", "- Wrote the migrate YAML for courses and programmes.\n- Dry run imported 1,180 of 1,204 items; 24 fail on missing taxonomy terms."],
      ["ASU-2108", "InProgress", "- Reproduced the bug: the query string is dropped when the breadcrumb is built.\n- Traced it to the custom `degree_search` path processor."],
      ["VER-1452", "InProgress", "- Upgraded PHP to 8.3 on staging.\n- Fixed two deprecated `${}` string interpolations flagged by PHPStan."],
    ],
  },
  {
    title: "Fixes out to QA",
    meetings: [
      "- Demoed the catalogue dry run. Missing taxonomy terms to be created by the content team.",
      "",
      "- Plus Alliance shared their theme repo; access sorted.",
      "",
    ],
    updates: [
      ["ASU-2108", "SentToQA", "- Kept the query string in the path processor and added a regression test.\n- Sent to QA with 3 test URLs."],
      ["VER-1452", "Released", "- Smoke-tested all staging cron jobs on PHP 8.3 — green.\n- Released to staging and announced in #veritech."],
      ["24491", "InProgress", "- Ran `upgrade_status` on Plus Alliance — 17 deprecations, mostly in the theme's preprocess functions."],
      ["25542", "InProgress", "- Finished the remaining 20 pages in **dev**; sent the preview link to Ashwini for review."],
    ],
  },
  {
    title: "Search API rate limiting",
    meetings: [
      "- ASU-2108 passed QA on all three URLs.",
      "- VER-1440: agreed 60 requests/min per IP, with a higher limit for the partner API key.",
      "",
      "",
    ],
    updates: [
      ["ASU-2108", "Done", "- QA passed. Merged and deployed to production.\n- Verified breadcrumbs on live filtered search pages."],
      ["VER-1440", "InProgress", "- Added a token-bucket limiter in front of `/api/search`.\n- Partner key bypass behind config."],
      ["24488", "InProgress", "- Fixed 15 of 23 deprecations (entity queries, `drupal_set_message`, route defaults)."],
    ],
  },
  {
    title: "Content sign-off & D11 compatibility",
    meetings: [
      "- 25542: content approved by Ashwini — push to live tonight.",
      "- VER-1440 load test booked for Wednesday.",
      "- Obs Studio asked for a sandbox build by Thursday.",
      "",
    ],
    updates: [
      ["25542", "Done", "- Content changes pushed to the **live** environment and verified.\n- Cleared the CDN cache for the updated paths."],
      ["STC-315", "InProgress", "- Scaffolded the Quick Action Links module: config entity, admin form and block plugin."],
      ["24491", "InProgress", "- Refactored the theme preprocess functions; 11 of 17 deprecations fixed."],
    ],
  },
  {
    title: "Load test & Quick Action Links",
    meetings: [
      "- ASU-2101: taxonomy terms created by the content team — full import unblocked.",
      "- Load test: limiter held at 5× normal traffic, p95 latency unchanged.",
      "",
      "",
    ],
    updates: [
      ["VER-1440", "SentToQA", "- Load test passed (5× traffic, p95 +3 ms).\n- Sent to QA with the partner-key test plan."],
      ["ASU-2101", "SentToQA", "- Full import: 1,204 / 1,204 items.\n- Sent to QA with the field-mapping checklist."],
      ["STC-315", "InProgress", "- Built the admin UI to reorder links and set icons.\n- Cache tags wired so blocks refresh on save."],
      ["STC-322", "InProgress", "- Ran axe on the enrolment form: 9 issues (labels, focus order, error messages)."],
    ],
  },
  {
    title: "Releases & sandbox builds",
    meetings: [
      "- ASU-2101 QA passed — scheduled for the Friday release window.",
      "- VER-1440 QA passed; ready for the next production deploy.",
      "- Sandbox builds shared with Obs Studio and Plus Alliance.",
      "",
    ],
    updates: [
      ["ASU-2101", "ReadyForProduction", "- QA passed. Release notes written; deploy scheduled for Friday."],
      ["VER-1440", "ReadyForProduction", "- QA passed including the partner key. Waiting for the production window."],
      ["24488", "SentToQA", "- All 23 deprecations fixed. Pushed to the Obs Studio sandbox and sent to QA."],
      ["24491", "InProgress", "- Fixed 4 of the remaining 6 deprecations. Two left in the custom menu module — waiting on a contrib patch."],
      ["STC-322", "InProgress", "- Fixed labels and focus order; 3 error-message issues left."],
    ],
  },
  {
    title: "Friday release",
    meetings: [
      "- Release window 16:00 — ASU-2101 going live.",
      "",
      "- Obs Studio QA feedback expected Monday.",
      "",
    ],
    updates: [
      ["ASU-2101", "Released", "- Released to production. Catalogue verified on live; old routes redirect."],
      ["STC-315", "SentToQA", "- Module finished with tests. Sent to QA on the StartCMS staging site."],
    ],
  },
];

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}`);
  const userId = user.id;

  // 1. Remove this account's content (children first). The account itself stays.
  const removed = await prisma.$transaction([
    prisma.followUpUpdate.deleteMany({ where: { userId } }),
    prisma.followUp.deleteMany({ where: { userId } }),
    prisma.task.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.link.deleteMany({ where: { userId } }),
    prisma.resource.deleteMany({ where: { userId } }),
    prisma.ticketHistoryEntry.deleteMany({ where: { userId } }),
    prisma.ticketWorkUpdate.deleteMany({ where: { userId } }),
    prisma.workLogAttachment.deleteMany({ where: { userId } }),
    prisma.workLog.deleteMany({ where: { userId } }),
    prisma.ticket.deleteMany({ where: { userId } }),
  ]);
  const labels = ["follow-up updates", "follow-ups", "tasks", "notes", "links", "resources", "ticket history", "ticket updates", "attachments", "work logs", "tickets"];
  console.log(`cleared ${email}:`, removed.map((r, i) => `${r.count} ${labels[i]}`).join(", "));

  // 2. Current sprint weekdays up to today.
  const today = localMidnight(new Date());
  const offset = Math.floor((today.getTime() - SPRINT_ANCHOR.getTime()) / 86_400_000 / SPRINT_DAYS);
  const sprintStart = new Date(SPRINT_ANCHOR.getFullYear(), SPRINT_ANCHOR.getMonth(), SPRINT_ANCHOR.getDate() + offset * SPRINT_DAYS);
  const days: Date[] = [];
  for (let i = 0; i < SPRINT_DAYS; i++) {
    const d = new Date(sprintStart.getFullYear(), sprintStart.getMonth(), sprintStart.getDate() + i);
    if (d > today) break;
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push(d);
  }
  const plan = DAYS.slice(0, days.length);

  // 3. Tickets — only the ones that actually get work this sprint.
  const used = new Set(plan.flatMap((day) => day.updates.map(([key]) => key)));
  const ticketId = new Map<string, string>();
  const finalStatus = new Map<string, Status>();
  for (const day of plan) for (const [key, status] of day.updates) finalStatus.set(key, status);
  for (const ticket of TICKETS.filter((t) => used.has(t.key))) {
    const firstDay = days[plan.findIndex((day) => day.updates.some(([key]) => key === ticket.key))];
    const row = await prisma.ticket.create({
      data: {
        userId,
        ticketId: ticket.key,
        title: ticket.title,
        projectName: ticket.project,
        status: finalStatus.get(ticket.key)!,
        createdAt: atLocal(firstDay, 9, 30),
      },
      select: { id: true },
    });
    ticketId.set(ticket.key, row.id);
  }

  // 4. Work logs with meetings and ticket updates.
  const meetingNames = ["ASU Sync-up", "Veritech Sync-up", "Client Sync-up", "Others"];
  let updates = 0;
  for (const [index, day] of plan.entries()) {
    const local = days[index];
    const workLog = await prisma.workLog.create({
      data: {
        userId,
        date: toLogDate(local),
        title: day.title,
        createdAt: atLocal(local, 9),
        meetings: {
          create: meetingNames.map((name, order) => ({ name, notes: day.meetings[order], order, isDefault: true })),
        },
      },
      select: { id: true },
    });
    for (const [n, [key, status, text]] of day.updates.entries()) {
      await prisma.ticketWorkUpdate.create({
        data: {
          ticketId: ticketId.get(key)!,
          workLogId: workLog.id,
          userId,
          description: text,
          status,
          createdAt: atLocal(local, 11 + n, 15 * n),
        },
      });
      updates += 1;
    }
    console.log(`  ${local.toDateString()}  "${day.title}"  (${day.updates.length} ticket updates)`);
  }

  const summary = [...finalStatus.entries()].map(([key, status]) => `${key}=${status}`).join(", ");
  console.log(`\ndone — ${plan.length} work logs, ${ticketId.size} tickets, ${updates} ticket updates`);
  console.log(`final statuses: ${summary}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
