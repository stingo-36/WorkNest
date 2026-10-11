import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  TaskPriority,
  TaskStatus,
  TicketStatus,
} from "../src/generated/prisma/enums";

/**
 * Bulk demo data — 10 weeks of realistic working days.
 *
 * Additive and idempotent: complements `seed.ts` rather than replacing it.
 * Skips weekends, gives most tickets MULTI-ENTRY history across several work
 * logs so the timeline UI has a real status journey to render.
 *
 *   npm run db:seed:bulk                      -> demo@workspace.local
 *   npm run db:seed:bulk -- you@example.com   -> an existing account of yours
 */

const DEFAULT_EMAIL = "demo@workspace.local";
// Read from the environment so no password lives in the repo.
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "";
if (DEFAULT_PASSWORD.length < 8) {
  throw new Error("Set SEED_PASSWORD (8+ chars) in app/.env before seeding.");
}
const WEEKS = 10;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function daysAgo(n: number): Date {
  const now = new Date();
  // LOCAL components on purpose: work logs are keyed on the local calendar
  // day (see src/lib/dashboard.ts). Reading getUTC* here put "today" a day
  // early whenever this ran in the evening east of Greenwich.
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(day - n * 86_400_000);
}
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Deterministic PRNG so re-runs produce the same data. */
let seed = 1337;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const chance = (p: number) => rnd() < p;

const MEETINGS = ["ASU Sync-up", "Veritech Sync-up", "Client Sync-up", "Others"] as const;

const ASU_NOTES = [
  "Sprint board walked. Retry-config work carried over; everything else on track.",
  "Discussed the staging deploy window. Agreed Thursday 6pm to avoid the QA cycle.",
  "Raised the flaky auth redirect. Owner assigned, ticket opened.",
  "Capacity review — two people out next week, pulled scope forward.",
  "Went through last week's incident. Action items logged as tickets.",
  "Quick standup, nothing blocking. Reviewed open PRs.",
];
const VER_NOTES = [
  "Walked through the API contract change. They'll version the endpoint rather than break it.",
  "Integration testing slot confirmed for Wednesday.",
  "Their side is still waiting on credentials from infra. Chased.",
  "Reviewed error-rate dashboard together — spike was their deploy, not ours.",
  "Agreed on the payload shape for the new fields. Documented in the ticket.",
];
const CLIENT_NOTES = [
  "Shared sprint progress. Client happy with the storefront timeline.",
  "Walked the new reporting screen. Feedback: wants a month filter.",
  "Discussed the invoicing edge case they hit. Reproduced on our side.",
  "Demoed the search improvements. Approved to ship.",
  "Scope conversation — the extra dashboard is next quarter, not this one.",
];
const OTHER_NOTES = [
  "Internal architecture discussion on where the report generation should live.",
  "Paired on the migration script for an hour.",
  "Interview debrief.",
  "Read through the new on-call runbook and left comments.",
  "",
];

type TicketSpec = { key: string; title: string; arc: TicketStatus[] };
const TICKETS: TicketSpec[] = [
  { key: "ASU-1234", title: "Payment retry job drops receipts", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.SentToQA, TicketStatus.InProgress, TicketStatus.SentToQA, TicketStatus.ReadyForProduction] },
  { key: "ASU-1288", title: "Writing users info for the spreadsheet import", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.ReadyForProduction, TicketStatus.InProgress, TicketStatus.SentToQA] },
  { key: "ASU-1301", title: "Dashboard month filter returns empty for December", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.ReadyForProduction, TicketStatus.Released] },
  { key: "ASU-1355", title: "Audit log missing actor on bulk edits", arc: [TicketStatus.InProgress, TicketStatus.InProgress] },
  { key: "VER-2456", title: "Verify SSO rollout for finance team", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.SentToQA, TicketStatus.ReadyForProduction] },
  { key: "VER-2490", title: "Webhook retries hammer the partner endpoint", arc: [TicketStatus.InProgress, TicketStatus.SentToQA, TicketStatus.InProgress, TicketStatus.SentToQA] },
  { key: "VER-2512", title: "Rate-limit headers missing on v2 API", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.ReadyForProduction] },
  { key: "ABC-567", title: "Onboarding wizard loses step 4 on refresh", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.ReadyForProduction] },
  { key: "ABC-604", title: "Invoice PDF rounds tax to the wrong decimal", arc: [TicketStatus.InProgress, TicketStatus.SentToQA] },
  { key: "OPS-118", title: "Nightly backup job silently skips one volume", arc: [TicketStatus.InProgress, TicketStatus.InProgress, TicketStatus.SentToQA, TicketStatus.ReadyForProduction, TicketStatus.Released] },
  { key: "OPS-140", title: "Alert fatigue: 200 pages/week from one check", arc: [TicketStatus.InProgress, TicketStatus.InProgress] },
  { key: "DEV-77", title: "Local dev seed takes 4 minutes", arc: [TicketStatus.InProgress, TicketStatus.ReadyForProduction] },
];

const WORK_BY_STATUS: Record<string, string[]> = {
  InProgress: ["Picked this up and read through the linked reports.", "Started investigation. Reproduced locally on the second attempt.", "Triaged. Narrowed it to the worker, not the API."],
  SentToQA: ["Deployed to QA and started validation. First pass looks clean.", "Handed to QA, waiting on a verdict.", "Verified the happy path and two edge cases."],
  ReadyForProduction: ["Signed off and merged. Ready for the production release.", "QA passed. Monitoring the release checklist."],
  Released: ["Released to production and monitoring for regressions.", "Production rollout complete and verified."],
  Done: ["Done — confirmed with the reporter."],
};

const NOTE_SEEDS = [
  ["Retry/backoff pattern worth reusing", "The approach from ASU-1234: exponential backoff with jitter, capped at 5 attempts, and an idempotency key on the receipt write. Worth lifting into the shared worker helper."],
  ["Questions for the next client sync", "1. Month filter on reports — confirm expected timezone.\n2. Do they want invoice PDFs emailed or just downloadable?\n3. Who signs off on the storefront copy?"],
  ["Deploy checklist (personal)", "- Migration applied to staging first\n- Seed a fresh DB and smoke test login\n- Check the error dashboard 10 min after\n- Post in the channel"],
  ["Things I keep forgetting", "- `npm run db:up` before dev\n- Prisma client is generated, not committed\n- Ticket IDs are uppercase everywhere"],
  ["1:1 talking points", "Capacity next month. Would like to own the reporting module end to end. Ask about the on-call rotation change."],
  ["Postmortem notes — backup skip", "Root cause: the volume list was cached at process start, so a volume added later was never picked up. Fix was to enumerate per run. Detection gap is the real issue — no alert on 'fewer volumes than yesterday'."],
];

const TASK_SEEDS: Array<[string, string, TaskPriority, number]> = [
  ["Write up the release notes", "Cover the retry fix and the search improvements.", TaskPriority.Medium, -1],
  ["Reply on ASU-1234", "Reporter asked whether the fix covers partial writes.", TaskPriority.High, 0],
  ["Prep stand-up summary", "", TaskPriority.Low, 0],
  ["Chase infra for webhook credentials", "Blocking VER-2490.", TaskPriority.Urgent, -2],
  ["Review the on-call runbook PR", "", TaskPriority.Medium, 1],
  ["Book the integration testing slot", "Wednesday, with the Veritech team.", TaskPriority.High, 1],
  ["Update the API contract doc", "New fields from the Veritech sync.", TaskPriority.Medium, 3],
  ["Month-end report", "Pull from work logs once the month closes.", TaskPriority.High, 6],
  ["Clean up stale feature flags", "Three flags fully rolled out for a month.", TaskPriority.Low, 10],
  ["Rotate the staging DB password", "", TaskPriority.Medium, 14],
];

const LINK_SEEDS: Array<[string, string, string, string, string[]]> = [
  ["Jira board", "https://example.atlassian.net/jira/software/board", "Current sprint board", "Work", ["jira", "sprint"]],
  ["GitHub — main repo", "https://github.com/example/platform", "Primary application repo", "Code", ["github"]],
  ["Confluence — runbooks", "https://example.atlassian.net/wiki/spaces/RUN", "On-call runbooks and postmortems", "Docs", ["confluence", "oncall"]],
  ["Error dashboard", "https://sentry.io/organizations/example/issues/", "Production error rates", "Monitoring", ["sentry", "prod"]],
  ["Grafana — API latency", "https://grafana.example.com/d/api-latency", "p95/p99 by endpoint", "Monitoring", ["grafana"]],
  ["Staging environment", "https://staging.example.com", "Pre-production", "Environments", ["staging"]],
  ["Design system (Figma)", "https://figma.com/file/example", "Components and tokens", "Design", ["figma"]],
  ["Timesheet", "https://example.bamboohr.com/time_tracking", "Weekly hours — due Friday", "Admin", ["admin", "weekly"]],
];

const RESOURCE_SEEDS: Array<[string, string, string, string | null, string, string[]]> = [
  ["Reset local database", "Drops, migrates and reseeds in one go.", "Command", null, "npm run db:down && npm run db:up && npm run db:migrate && npm run db:seed", ["db", "local"]],
  ["Tail production logs for one service", "Replace SERVICE.", "Command", null, "kubectl logs -f deploy/SERVICE -n production --since=15m --tail=200", ["k8s", "prod"]],
  ["Find the slowest queries", "Postgres, needs pg_stat_statements.", "Snippet", null, "SELECT calls, mean_exec_time, query\nFROM pg_stat_statements\nORDER BY mean_exec_time DESC\nLIMIT 20;", ["postgres", "performance"]],
  ["Idempotent worker handler", "The pattern from ASU-1234.", "Snippet", null, "async function handle(job) {\n  const key = idempotencyKey(job);\n  if (await seen(key)) return;\n  await withBackoff(() => process(job), { attempts: 5, jitter: true });\n  await mark(key);\n}", ["worker", "pattern"]],
  ["Prisma relation queries", "Official docs — nested reads and writes.", "Documentation", "https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries", "", ["prisma", "docs"]],
  ["WCAG contrast minimums", "4.5:1 body text, 3:1 large text and UI boundaries.", "Documentation", "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html", "", ["a11y"]],
  ["Postgres EXPLAIN, visualised", "Paste a plan, get a readable tree.", "Tool", "https://explain.dalibo.com/", "", ["postgres", "tool"]],
  ["Writing a blameless postmortem", "The template we settled on.", "Reference", null, "1. Impact — who, how long, how bad\n2. Timeline — detection to resolution\n3. Root cause — mechanism, not a person\n4. Detection gap — why we didn't know sooner\n5. Actions — owned and dated", ["process", "postmortem"]],
];

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase().trim();

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: email === DEFAULT_EMAIL ? "Demo User" : email.split("@")[0]!,
        passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 12),
      },
    });
    console.log(`created account  ${email}  (password = SEED_PASSWORD)`);
  } else {
    console.log(`using existing account  ${email}`);
  }
  const userId = user.id;

  // ---- tickets (upsert so re-runs don't duplicate) -------------------------
  const ticketIds = new Map<string, string>();
  for (const spec of TICKETS) {
    const t = await prisma.ticket.upsert({
      where: { userId_ticketId: { userId, ticketId: spec.key } },
      update: { title: spec.title },
      create: { userId, ticketId: spec.key, title: spec.title, status: spec.arc[0]! },
    });
    ticketIds.set(spec.key, t.id);
  }

  // ---- work logs across WEEKS, weekdays only ------------------------------
  const arcStep = new Map<string, number>();
  const latestStatus = new Map<string, TicketStatus>();
  let logs = 0, updates = 0;

  for (let d = WEEKS * 7; d >= 0; d--) {
    const date = daysAgo(d);
    if (isWeekend(date)) continue;
    if (chance(0.12)) continue; // the odd day with no log

    const existing = await prisma.workLog.findUnique({
      where: { userId_date: { userId, date } },
    });
    if (existing) continue;

    const notesFor: Record<string, string> = {
      "ASU Sync-up": chance(0.85) ? pick(ASU_NOTES) : "",
      "Veritech Sync-up": chance(0.6) ? pick(VER_NOTES) : "",
      "Client Sync-up": chance(0.45) ? pick(CLIENT_NOTES) : "",
      Others: chance(0.35) ? pick(OTHER_NOTES) : "",
    };

    const workLog = await prisma.workLog.create({
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
            notes: notesFor[name] ?? "",
          })),
        },
      },
    });
    logs++;

    // 1-3 tickets touched that day, advancing along their arc
    const touched = new Set<string>();
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const spec = pick(TICKETS);
      if (touched.has(spec.key)) continue;
      touched.add(spec.key);

      const step = arcStep.get(spec.key) ?? 0;
      if (step >= spec.arc.length) continue;       // arc finished
      const status = spec.arc[step]!;
      if (chance(0.55)) arcStep.set(spec.key, step + 1);

      await prisma.ticketWorkUpdate.upsert({
        where: {
          ticketId_workLogId: { ticketId: ticketIds.get(spec.key)!, workLogId: workLog.id },
        },
        update: {},
        create: {
          ticketId: ticketIds.get(spec.key)!,
          workLogId: workLog.id,
          userId,
          description: pick(WORK_BY_STATUS[status] ?? ["Worked on this."]),
          status,
          createdAt: atHour(date, 11 + i * 2),
          updatedAt: atHour(date, 11 + i * 2),
        },
      });
      updates++;
      latestStatus.set(spec.key, status);
    }
  }

  // ticket current status = status of its newest update
  for (const [key, status] of latestStatus) {
    await prisma.ticket.update({
      where: { id: ticketIds.get(key)! },
      data: { status },
    });
  }

  // ---- tasks / notes / links / resources ----------------------------------
  let tasks = 0;
  for (const [title, description, priority, dueOffset] of TASK_SEEDS) {
    const done = dueOffset < -1;
    const r = await prisma.task.createMany({
      data: [{
        userId, title, description,
        dueDate: daysAgo(-dueOffset),
        priority,
        status: done ? TaskStatus.Completed : dueOffset <= 0 ? TaskStatus.InProgress : TaskStatus.Todo,
      }],
      skipDuplicates: true,
    });
    tasks += r.count;
  }

  let notes = 0;
  for (const [i, [title, content]] of NOTE_SEEDS.entries()) {
    // One notebook per seed title, with a single section and page.
    await prisma.note.create({
      data: {
        userId,
        title,
        createdAt: daysAgo(i * 4 + 1),
        updatedAt: daysAgo(i * 2),
        sections: {
          create: [
            {
              title: "Notes",
              order: 0,
              pages: {
                create: [
                  {
                    title: "Notes",
                    order: 0,
                    content: {
                      type: "doc",
                      content: [
                        { type: "paragraph", content: [{ type: "text", text: content }] },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    notes += 1;
  }

  let links = 0;
  for (const [title, url, description, category, tags] of LINK_SEEDS) {
    const r = await prisma.link.createMany({
      data: [{ userId, title, url, description, category, tags }],
      skipDuplicates: true,
    });
    links += r.count;
  }

  let resources = 0;
  for (const [title, description, type, url, content, tags] of RESOURCE_SEEDS) {
    const r = await prisma.resource.createMany({
      data: [{ userId, title, description, type, url, content, tags }],
      skipDuplicates: true,
    });
    resources += r.count;
  }

  console.log(
    `\nadded  ${logs} work logs · ${updates} ticket updates · ${TICKETS.length} tickets\n` +
    `       ${tasks} tasks · ${notes} notes · ${links} links · ${resources} resources`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
