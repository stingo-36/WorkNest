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
 * Demo data for the frontend dev.
 *
 * The point of this seed is the TICKET HISTORY: tickets carry several
 * TicketWorkUpdate rows across different work logs and different statuses, so
 * the timeline UI and the "previous updates" panel have something real to
 * render. Idempotent — safe to re-run.
 */

// Fresh clones get `SEED_EMAIL=demo@worknest.local` from `npm run setup`; the
// fallback keeps the owner's existing app/.env seeding their own account.
const DEMO_EMAIL = process.env.SEED_EMAIL?.trim() || "tariboi36@gmail.com";
// Never commit a real password: read it from the environment (app/.env locally,
// the host's env vars in a hosted database).
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "";
if (DEMO_PASSWORD.length < 8) {
  throw new Error("Set SEED_PASSWORD (8+ chars) in app/.env before seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** `daysAgo(0)` = today at UTC midnight. */
function daysAgo(n: number): Date {
  const now = new Date();
  // LOCAL components on purpose: work logs are keyed on the local calendar
  // day (see src/lib/dashboard.ts). Reading getUTC* here put "today" a day
  // early whenever this ran in the evening east of Greenwich.
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(day - n * 86_400_000);
}

/** A timestamp inside a given day, so history sorts sensibly. */
function atHour(date: Date, hour: number): Date {
  return new Date(date.getTime() + hour * 3_600_000);
}

const DEFAULT_MEETINGS = [
  "ASU Sync-up",
  "Veritech Sync-up",
  "Client Sync-up",
  "Others",
];

async function main() {
  console.log("Seeding…");

  // This is a single-user local workspace. A seed run intentionally replaces
  // all existing local accounts and their cascade-owned content.
  await prisma.$transaction([
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // --- user ----------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.create({
    data: { email: DEMO_EMAIL, name: "Demo User", passwordHash },
  });

  // --- work logs: today, 2 days ago, 5 days ago ----------------------------
  const dayToday = daysAgo(0);
  const dayMinus2 = daysAgo(2);
  const dayMinus5 = daysAgo(5);

  const meetingNotes: Record<string, Record<string, string>> = {
    [dayMinus5.toISOString()]: {
      "ASU Sync-up":
        "Sprint 42 kickoff. Agreed to split the billing migration into two tickets.\nCapacity: 3 devs, QA joins Thursday.",
      "Veritech Sync-up":
        "Reviewed the staging deploy failure. Root cause was a stale env var on the runner.",
      "Client Sync-up":
        "Walked the client through the new reporting screens. They want CSV export before the pilot.",
      Others: "",
    },
    [dayMinus2.toISOString()]: {
      "ASU Sync-up":
        "Mid-sprint check. Billing migration is behind — blocked on the vendor sandbox account.",
      "Veritech Sync-up":
        "Pairing session on the auth refactor. Decided to keep JWT sessions rather than DB sessions.",
      "Client Sync-up": "Client cancelled, rescheduled to Thursday.",
      Others:
        "Interviewed a backend candidate. Strong on Postgres, light on TypeScript.",
    },
    [dayToday.toISOString()]: {
      "ASU Sync-up":
        "Vendor sandbox is unblocked. Billing migration back in progress, targeting Friday.",
      "Veritech Sync-up":
        "Demoed the ticket history timeline. Feedback: show the source work log date more prominently.",
      "Client Sync-up": "",
      Others: "",
    },
  };

  const workLogs: Record<string, { id: string; date: Date }> = {};

  for (const date of [dayMinus5, dayMinus2, dayToday]) {
    const notes = meetingNotes[date.toISOString()] ?? {};
    const workLog = await prisma.workLog.create({
      data: {
        userId: user.id,
        date,
        title: "Daily Work Log",
        createdAt: atHour(date, 9),
        meetings: {
          create: DEFAULT_MEETINGS.map((name, order) => ({
            name,
            notes: notes[name] ?? "",
            order,
            isDefault: true,
          })),
        },
      },
    });
    workLogs[date.toISOString()] = { id: workLog.id, date };
  }

  // --- tickets with multi-entry history ------------------------------------
  //
  // Each entry below becomes ONE TicketWorkUpdate row, on the work log for
  // that day, with the status the ticket had at that moment. This is exactly
  // the shape the app produces at runtime — never more than one row per
  // (ticket, work log).

  type Entry = { day: Date; hour: number; status: TicketStatus; text: string };

  const tickets: {
    key: string;
    title: string;
    entries: Entry[];
  }[] = [
    {
      key: "ASU-1234",
      title: "Migrate billing service to the new invoicing API",
      entries: [
        {
          day: dayMinus5,
          hour: 11,
          status: TicketStatus.InProgress,
          text: "Mapped the old invoice payload to the new schema. Wrote the adapter and a throwaway script to diff 200 historical invoices — 6 mismatches, all rounding on tax lines.",
        },
        {
          day: dayMinus2,
          hour: 14,
          status: TicketStatus.SentToQA,
          text: "Blocked: vendor sandbox credentials expired and the renewal request is sitting with procurement. Cannot verify the live call path until that clears. Adapter work is done and merged behind a flag.",
        },
        {
          day: dayToday,
          hour: 10,
          status: TicketStatus.InProgress,
          text: "Sandbox is back. Ran the full reconciliation against 2k invoices, all matched after the tax-rounding fix. Next: wire the feature flag to staging and watch a day of traffic.",
        },
      ],
    },
    {
      key: "VER-2456",
      title: "Auth refactor — move to JWT sessions",
      entries: [
        {
          day: dayMinus5,
          hour: 15,
          status: TicketStatus.InProgress,
          text: "Replaced the DB session lookup with a signed JWT. Session callback now carries userId so every query can scope by it without a second round trip.",
        },
        {
          day: dayMinus2,
          hour: 16,
          status: TicketStatus.SentToQA,
          text: "Pairing session with Veritech. Covered token refresh and the logout path. Handed to QA on staging.",
        },
        {
          day: dayToday,
          hour: 13,
          status: TicketStatus.ReadyForProduction,
          text: "QA signed off. Merged to main. Follow-up ticket opened for the 'remember this device' option.",
        },
      ],
    },
    {
      key: "ABC-567",
      title: "CSV export for the weekly report screen",
      entries: [
        {
          day: dayMinus2,
          hour: 11,
          status: TicketStatus.InProgress,
          text: "Scoped with the client. They want the same columns as the on-screen table plus a totals row. Deferred to next sprint — no work started.",
        },
        {
          day: dayToday,
          hour: 15,
          status: TicketStatus.InProgress,
          text: "Started the streaming CSV route so large exports don't buffer in memory. Header row and totals row are done.",
        },
      ],
    },
    {
      key: "ASU-1310",
      title: "Flaky integration test on the payments runner",
      entries: [
        {
          day: dayMinus5,
          hour: 17,
          status: TicketStatus.ReadyForProduction,
          text: "Reproduced once in 40 runs. Suspect a shared fixture. Waiting on infra to give me the runner logs with debug enabled.",
        },
      ],
    },
  ];

  for (const spec of tickets) {
    const last = spec.entries[spec.entries.length - 1];

    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        ticketId: spec.key,
        title: spec.title,
        // Current status = the status on the newest update (spec 21 step 6).
        status: last.status,
        createdAt: atHour(spec.entries[0].day, spec.entries[0].hour),
        updatedAt: atHour(last.day, last.hour),
      },
    });

    for (const entry of spec.entries) {
      const workLog = workLogs[entry.day.toISOString()];
      const ts = atHour(entry.day, entry.hour);
      await prisma.ticketWorkUpdate.create({
        data: {
          ticketId: ticket.id,
          workLogId: workLog.id,
          userId: user.id,
          description: entry.text,
          status: entry.status,
          createdAt: ts,
          updatedAt: ts,
        },
      });
    }

    console.log(
      `  ${spec.key} — ${spec.entries.length} history entries, now ${last.status}`,
    );
  }

  const billing = await prisma.ticket.findUnique({
    where: { userId_ticketId: { userId: user.id, ticketId: "ASU-1234" } },
  });

  // --- tasks ---------------------------------------------------------------
  await prisma.task.createMany({
    data: [
      {
        userId: user.id,
        title: "Write the migration runbook for billing cutover",
        description: "Steps, rollback plan, who to page.",
        dueDate: daysAgo(-1),
        priority: TaskPriority.High,
        status: TaskStatus.InProgress,
        ticketId: billing?.id ?? null,
      },
      {
        userId: user.id,
        title: "Review the candidate's take-home",
        dueDate: daysAgo(0),
        priority: TaskPriority.Medium,
        status: TaskStatus.Todo,
      },
      {
        userId: user.id,
        title: "Renew the vendor sandbox credentials",
        description: "Expired mid-sprint and blocked ASU-1234 for two days.",
        dueDate: daysAgo(1),
        priority: TaskPriority.Urgent,
        status: TaskStatus.Completed,
        completedAt: daysAgo(0),
      },
      {
        userId: user.id,
        title: "Draft the Q3 reporting proposal",
        dueDate: daysAgo(-6),
        priority: TaskPriority.Low,
        status: TaskStatus.Todo,
      },
    ],
  });

  // --- notes ---------------------------------------------------------------
  // Notes are notebooks now: Note -> Section -> Page, each page a TipTap doc.
  const paragraph = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  await prisma.note.create({
    data: {
      userId: user.id,
      title: "Billing cutover",
      description: "Everything needed to run the cutover without paging anyone.",
      iconName: "LuReceipt",
      iconLibrary: "lu",
      favorite: true,
      sections: {
        create: [
          {
            title: "Runbook",
            order: 0,
            pages: {
              create: [
                {
                  title: "Checklist",
                  order: 0,
                  content: paragraph(
                    "1. Flag off  2. Drain the queue  3. Run reconciliation  4. Flag on for 5% of accounts  5. Watch error rate for 30 min",
                  ),
                },
                {
                  title: "Rollback",
                  order: 1,
                  content: paragraph(
                    "Flag off, re-run reconciliation from the last clean checkpoint, then post in #billing before anyone asks.",
                  ),
                },
              ],
            },
          },
          {
            title: "Decisions",
            order: 1,
            pages: {
              create: [
                {
                  title: "Why JWT over DB sessions",
                  order: 0,
                  content: paragraph(
                    "Route protection runs before render. A DB session means a query on every navigation. JWT keeps the check local; userId rides in the token and every data query still scopes by it.",
                  ),
                },
              ],
            },
          },
        ],
      },
    },
  });

  // --- links ---------------------------------------------------------------
  await prisma.link.createMany({
    data: [
      {
        userId: user.id,
        title: "Jira — ASU board",
        url: "https://example.atlassian.net/jira/software/projects/ASU/boards/1",
        description: "Sprint board",
        category: "Jira",
        tags: ["asu"],
      },
      {
        userId: user.id,
        title: "Invoicing API docs",
        url: "https://example.com/docs/invoicing",
        description: "Vendor reference for the billing migration",
        category: "Docs",
        tags: ["billing"],
      },
      {
        userId: user.id,
        title: "Staging deploy dashboard",
        url: "https://example.com/deploys/staging",
        category: "Internal tools",
        tags: ["deploys"],
      },
    ],
  });

  // --- resources -----------------------------------------------------------
  await prisma.resource.createMany({
    data: [
      {
        userId: user.id,
        title: "Reset the local database",
        description: "Wipes and re-seeds the dev Postgres.",
        type: "Command",
        content: "npm run db:reset",
        tags: ["prisma", "local"],
      },
      {
        userId: user.id,
        title: "Find slow queries in Postgres",
        type: "Snippet",
        content:
          "select query, calls, mean_exec_time\nfrom pg_stat_statements\norder by mean_exec_time desc\nlimit 20;",
        tags: ["postgres", "perf"],
      },
      {
        userId: user.id,
        title: "Prisma relation queries",
        type: "Documentation",
        url: "https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries",
        tags: ["prisma"],
      },
    ],
  });

  const counts = {
    workLogs: await prisma.workLog.count({ where: { userId: user.id } }),
    tickets: await prisma.ticket.count({ where: { userId: user.id } }),
    updates: await prisma.ticketWorkUpdate.count({ where: { userId: user.id } }),
    tasks: await prisma.task.count({ where: { userId: user.id } }),
    notes: await prisma.note.count({ where: { userId: user.id } }),
    links: await prisma.link.count({ where: { userId: user.id } }),
    resources: await prisma.resource.count({ where: { userId: user.id } }),
  };

  console.log("\nSeeded:", counts);
  console.log("\n  Login:    %s", DEMO_EMAIL);
  console.log("  Password: (value of SEED_PASSWORD)\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
