/**
 * Reset the demo account (DEMO_EMAIL in app/.env) to a brand-new, fictional
 * workspace — "Lumen Health", a patient-portal team — on every page: work logs
 * for the last four sprints, tickets with their history, Tracker to-dos /
 * follow-ups / notes, notebooks, resources, achievements and 5-15 reports.
 *
 *   npx tsx prisma/seed-fresh-demo.ts   (needs DEMO_EMAIL=you@example.com in app/.env)
 *
 * DESTRUCTIVE for that one account: it deletes all of its records first and
 * keeps its name and password. It refuses to touch any other account.
 * Nothing here is copied from another user's data.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateJSON } from "@tiptap/html/server";

import { buildNoteExtensions } from "../src/components/notes/editor-extensions";
import { PrismaClient } from "../src/generated/prisma/client";
import type { TicketStatus } from "../src/generated/prisma/enums";

// From app/.env (gitignored), so a real address never lands in the public repo.
const EMAIL = process.env.DEMO_EMAIL?.trim();
if (!EMAIL) throw new Error("Set DEMO_EMAIL in app/.env to the account to reset.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const extensions = buildNoteExtensions();
const toDoc = (html: string) => generateJSON(html, extensions);

// ---------------------------------------------------------------- dates
const TODAY = "2026-11-11";
/** A calendar day ("YYYY-MM-DD") as the UTC midnight Prisma stores for @db.Date. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** A moment on a day, local-ish working hours. */
const at = (iso: string, hh: number, mm = 0) => new Date(`${iso}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`);
const addDays = (iso: string, n: number) => {
  const d = day(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isWeekend = (iso: string) => [0, 6].includes(day(iso).getUTCDay());

// Small deterministic RNG so every run builds the same workspace.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;

// ---------------------------------------------------------------- people & projects
const PROJECTS = ["Patient Portal", "Billing API", "Mobile App", "Design System"];
const MEETINGS = ["Daily standup", "Sprint planning", "Design review"];

// ---------------------------------------------------------------- tickets
type TicketPlan = { key: string; title: string; project: string; updates: Array<[string, TicketStatus, string]> };
const TICKETS: TicketPlan[] = [
  { key: "LUM-118", title: "Appointment reminders send twice for recurring visits", project: "Patient Portal", updates: [
    ["2026-09-03", "InProgress", "Reproduced with a weekly series — the scheduler enqueues one job per occurrence and one for the series."],
    ["2026-09-04", "InProgress", "Deduplicated jobs by (appointmentId, sendAt). Added a unique index."],
    ["2026-09-07", "SentToQA", "Fix behind the `reminders_v2` flag on staging; asked Marcus for a QA pass."],
    ["2026-09-10", "ReadyForProduction", "QA passed. Ready for Thursday's release train."],
    ["2026-09-17", "Done", "Released and verified — duplicate sends dropped to zero in the dashboard."],
  ] },
  { key: "LUM-121", title: "Billing retry backoff ignores the provider's Retry-After header", project: "Billing API", updates: [
    ["2026-09-08", "InProgress", "Read the provider docs; we hard-code 30s. Parsing Retry-After (seconds and HTTP-date)."],
    ["2026-09-09", "InProgress", "Exponential backoff with jitter, capped at 15 min; honour Retry-After when larger."],
    ["2026-09-14", "SentToQA", "Unit tests for both header formats; staging run against the sandbox looked clean."],
    ["2026-09-21", "Done", "Shipped. Retry storms during the provider incident were gone."],
  ] },
  { key: "LUM-126", title: "Dark mode tokens for the design system", project: "Design System", updates: [
    ["2026-09-15", "InProgress", "Mapped the light palette to semantic tokens with Elena; 14 colours had no semantic name."],
    ["2026-09-16", "InProgress", "Added `surface`, `surface-raised`, `text-muted` and `border-subtle` tokens with dark values."],
    ["2026-09-22", "ReadyForProduction", "Storybook updated; contrast checked (all ≥ 4.5:1 for text)."],
    ["2026-09-28", "Released", "Released in design-system 3.4.0."],
  ] },
  { key: "LUM-131", title: "Lab results page loads slowly for patients with long history", project: "Patient Portal", updates: [
    ["2026-09-23", "InProgress", "EXPLAIN shows a seq scan on lab_results; missing composite index on (patient_id, collected_at)."],
    ["2026-09-24", "InProgress", "Index added in a concurrent migration; page load 4.1s → 380ms on the staging copy."],
    ["2026-09-25", "InProgress", "Added cursor pagination so the first page renders without the full history."],
    ["2026-10-01", "SentToQA", "QA checking pagination with the 'long history' test patients."],
    ["2026-10-06", "Done", "Released. p95 for the page is now 520ms."],
  ] },
  { key: "LUM-135", title: "Mobile: biometric login on Android 14", project: "Mobile App", updates: [
    ["2026-09-29", "InProgress", "BiometricPrompt fails silently on Pixel 8 — the crypto object isn't initialised after a key rotation."],
    ["2026-09-30", "InProgress", "Recreate the key when KeyPermanentlyInvalidatedException is thrown; fall back to PIN."],
    ["2026-10-05", "SentToQA", "Build 2.18.0-rc1 on the internal track."],
    ["2026-10-08", "Released", "Rolled out to 20% → 100% with no crash spikes."],
  ] },
  { key: "LUM-138", title: "Invoice PDF shows the wrong tax line for split payments", project: "Billing API", updates: [
    ["2026-10-07", "InProgress", "Split payments sum tax per instalment and round each — off by a cent on odd totals."],
    ["2026-10-09", "InProgress", "Compute tax once on the invoice total and allocate the remainder to the last instalment."],
    ["2026-10-13", "SentToQA", "Added property tests for 1–12 instalments."],
    ["2026-10-19", "Done", "Released; finance confirmed last week's invoices reconcile."],
  ] },
  { key: "LUM-142", title: "Payment retry dashboard for support", project: "Billing API", updates: [
    ["2026-10-14", "InProgress", "Drafted the read model: one row per failed charge with attempts and next retry."],
    ["2026-10-15", "InProgress", "Built the list with filters (status, provider, age) and a retry-now action."],
    ["2026-10-20", "InProgress", "Retry-now is idempotent via the charge's idempotency key."],
    ["2026-10-22", "SentToQA", "On staging for Marcus; support lead walking through it Monday."],
    ["2026-10-28", "SentToQA", "QA found the age filter uses UTC days; fixed to the clinic's timezone."],
  ] },
  { key: "LUM-145", title: "Patient profile: edit emergency contacts", project: "Patient Portal", updates: [
    ["2026-10-21", "InProgress", "Form with up to three contacts; reuses the phone input from onboarding."],
    ["2026-10-23", "InProgress", "Validation and an audit-log entry for every change (compliance asked for it)."],
    ["2026-10-27", "ReadyForProduction", "Approved by Priya; in Thursday's release."],
  ] },
  { key: "LUM-149", title: "Appointment booking: show clinician photos", project: "Patient Portal", updates: [
    ["2026-10-26", "InProgress", "Images come from the HR system at 4000px — added a resize step to 160px WebP on upload."],
    ["2026-10-28", "InProgress", "Lazy-load below the fold; placeholder initials when there's no photo."],
    ["2026-10-30", "InProgress", "Waiting on Elena's final crop guidelines before the last pass."],
    ["2026-11-04", "InProgress", "Applied Elena's crop guide: 1:1, face centred, 160px WebP."],
    ["2026-11-06", "SentToQA", "On staging behind the `clinician_photos` flag; asked Marcus for a QA pass."],
  ] },
  { key: "LUM-151", title: "Upgrade the portal to Node 22 LTS", project: "Patient Portal", updates: [
    ["2026-10-27", "InProgress", "Two deps pinned to Node 18 APIs; swapped `node-fetch` for global fetch."],
    ["2026-10-30", "InProgress", "CI green on Node 22; staging deploy scheduled with Kenji."],
    ["2026-11-05", "InProgress", "Fixed two snapshot tests that broke on Node 22's new `Intl` output."],
    ["2026-11-10", "InProgress", "Load test on a Node 22 build: memory flat, p95 unchanged."],
  ] },
  { key: "LUM-153", title: "Mobile tab bar redesign", project: "Mobile App", updates: [
    ["2026-10-29", "InProgress", "Spike: five tabs with a raised centre action; waiting on final icons."],
  ] },
];

// ---------------------------------------------------------------- work-log copy
const STANDUP = [
  "Yesterday wrapped the migration; today pairing on QA feedback. No blockers.",
  "Picked up the next ticket from the board; flagged that the staging DB is slow again.",
  "Finished code review for Kenji's infra PR; today on the billing work.",
  "Blocked briefly on sandbox credentials — Kenji unblocked it in the morning.",
  "Demo prep for Friday; aiming to have the dashboard on staging by Wednesday.",
  "Mostly reviews today; planning to write the docs for the retry endpoint.",
];
const EXTRA_MEETINGS: Array<[string, string]> = [
  ["Sprint planning", "Committed to 34 points. Took the payment-retry dashboard and two portal bugs."],
  ["Design review", "Elena walked through the booking flow; agreed to drop the second confirmation screen."],
  ["Sprint planning", "Carry-over: tab bar spike. Priya wants the emergency-contacts form in this sprint."],
  ["Design review", "Reviewed dark-mode tokens; two greys too close in dark mode — Elena will tweak."],
];
/** First day of each 14-day sprint (anchor 2 Sep) → that day's planning notes. */
const SPRINT_STARTS: Record<string, string> = {
  "2026-09-16": "Committed to 34 points. Took the payment-retry dashboard and two portal bugs.",
  "2026-09-30": "Lab results performance is the sprint goal; biometric login carried over.",
  "2026-10-14": "Carry-over: tab bar spike. Priya wants the emergency-contacts form in this sprint.",
  "2026-10-28": "Goal: release the retry dashboard. Clinician photos and the Node 22 upgrade in parallel.",
};
const LEARNING = [
  "Learned that `CREATE INDEX CONCURRENTLY` can't run inside a transaction — our migration tool wraps everything, so it needs a separate migration.",
  "Retry-After can be seconds **or** an HTTP-date. `Date.parse` handles the date form; the number form needs `Number()`.",
  "Android: keys created with `setUserAuthenticationRequired(true)` are invalidated when a new fingerprint is enrolled.",
  "Postgres `EXPLAIN (ANALYZE, BUFFERS)` shows shared hits vs reads — the slow query was all reads on a cold cache.",
  "React: `useDeferredValue` kept the lab results filter responsive while the list re-rendered.",
  "Rounding money per line then summing ≠ summing then rounding. Always round once, at the end.",
  "",
];

// ---------------------------------------------------------------- notebooks
type SeedNote = { title: string; description: string; iconName: string; iconLibrary: "lu" | "si"; favorite?: boolean; sections: Array<{ title: string; pages: Array<{ title: string; html: string }> }> };
const NOTEBOOKS: SeedNote[] = [
  { title: "Lumen onboarding", description: "Everything I wish I'd known in week one.", iconName: "LuCompass", iconLibrary: "lu", favorite: true, sections: [
    { title: "Getting set up", pages: [
      { title: "Local environment", html: `<h2>Clone and run</h2><ol><li>Install Node 22 and pnpm</li><li><code>pnpm install</code> at the repo root</li><li><code>pnpm dev --filter portal</code></li></ol><p>Ask Kenji for the <strong>sandbox</strong> secrets — never use production keys locally.</p>` },
      { title: "Who owns what", html: `<table><tbody><tr><th>Area</th><th>Owner</th></tr><tr><td>Patient Portal</td><td>Fatima (tech lead)</td></tr><tr><td>Billing API</td><td>Me + Marcus (QA)</td></tr><tr><td>Infra / CI</td><td>Kenji</td></tr><tr><td>Design system</td><td>Elena</td></tr></tbody></table>` },
    ] },
    { title: "How we ship", pages: [
      { title: "Release train", html: `<p>Releases go out every <strong>Thursday</strong>. A ticket must be <mark>Ready for production</mark> by Wednesday 5pm.</p><ul><li>Feature flags for anything risky</li><li>Roll out 20% → 100% on mobile</li></ul>` },
    ] },
  ] },
  { title: "PostgreSQL", description: "Query plans, indexes and migration gotchas.", iconName: "SiPostgresql", iconLibrary: "si", sections: [
    { title: "Performance", pages: [
      { title: "Reading EXPLAIN", html: `<p>Start with <code>EXPLAIN (ANALYZE, BUFFERS)</code>. Look for:</p><ul><li><strong>Seq Scan</strong> on big tables</li><li>Row estimates that are 10× off</li><li>Lots of <em>read</em> buffers (cold cache)</li></ul><pre><code>EXPLAIN (ANALYZE, BUFFERS)\nSELECT * FROM lab_results WHERE patient_id = $1 ORDER BY collected_at DESC LIMIT 50;</code></pre>` },
      { title: "Composite indexes", html: `<p>Column order matters: equality columns first, then the sort column.</p><pre><code>CREATE INDEX CONCURRENTLY lab_results_patient_collected\n  ON lab_results (patient_id, collected_at DESC);</code></pre>` },
    ] },
    { title: "Migrations", pages: [
      { title: "Safe migrations", html: `<ul><li>Add columns as nullable, backfill, then add NOT NULL</li><li><code>CONCURRENTLY</code> can't run in a transaction</li><li>Set <code>lock_timeout</code> so a migration never queues behind a long query</li></ul>` },
    ] },
  ] },
  { title: "React & Next.js", description: "Patterns that worked on the portal.", iconName: "SiReact", iconLibrary: "si", sections: [
    { title: "Rendering", pages: [
      { title: "Keeping filters snappy", html: `<p><code>useDeferredValue</code> lets the input update immediately while the list catches up.</p><pre><code>const deferred = useDeferredValue(query);\nconst rows = useMemo(() =&gt; filter(results, deferred), [results, deferred]);</code></pre>` },
      { title: "Server vs client components", html: `<p>Fetch on the server, keep interactivity in small client islands. Pass <strong>serialisable</strong> props only — dates as ISO strings.</p>` },
    ] },
    { title: "Testing", pages: [
      { title: "Testing Library habits", html: `<ul><li>Query by role and name, not test ids</li><li><code>userEvent</code> over <code>fireEvent</code></li><li>One behaviour per test</li></ul>` },
    ] },
  ] },
  { title: "System design prep", description: "Notes for the senior interview loop.", iconName: "LuNetwork", iconLibrary: "lu", sections: [
    { title: "Building blocks", pages: [
      { title: "Idempotency", html: `<p>Every payment call carries an <strong>idempotency key</strong>. Retries with the same key return the original result instead of charging twice.</p>` },
      { title: "Queues and retries", html: `<p>Exponential backoff with jitter: <code>min(cap, base × 2^attempt) × random(0.5, 1)</code>. Dead-letter after N attempts.</p>` },
    ] },
  ] },
];

// ---------------------------------------------------------------- resources
const RESOURCES: Array<{ title: string; type: string; url?: string; content?: string; description?: string; tags: string[]; favorite?: boolean }> = [
  { title: "PostgreSQL EXPLAIN visualiser", type: "Tool", url: "https://explain.dalibo.com", description: "Paste a plan, get a tree.", tags: ["postgres", "performance"], favorite: true },
  { title: "Node 22 release notes", type: "Documentation", url: "https://nodejs.org/en/blog/release", tags: ["node"] },
  { title: "React docs — useDeferredValue", type: "Documentation", url: "https://react.dev/reference/react/useDeferredValue", tags: ["react"] },
  { title: "Restart the staging worker", type: "Command", content: "kubectl rollout restart deployment/portal-worker -n staging", description: "When the reminder queue gets stuck.", tags: ["k8s", "staging"], favorite: true },
  { title: "Tail billing logs", type: "Command", content: "kubectl logs -f deploy/billing-api -n staging --since=15m | grep -i retry", tags: ["k8s", "billing"] },
  { title: "Find long-running queries", type: "Snippet", content: "SELECT pid, now() - query_start AS runtime, query\nFROM pg_stat_activity\nWHERE state = 'active'\nORDER BY runtime DESC;", tags: ["postgres"] },
  { title: "Money rounding helper", type: "Snippet", content: "export const toCents = (n: number) => Math.round(n * 100);\nexport const allocate = (total: number, parts: number) => {\n  const base = Math.floor(total / parts);\n  return Array.from({ length: parts }, (_, i) => base + (i < total % parts ? 1 : 0));\n};", tags: ["billing", "typescript"] },
  { title: "Figma — Lumen design system", type: "App", url: "https://www.figma.com", description: "Elena's component library.", tags: ["design"] },
  { title: "Android biometric guide", type: "Reference", url: "https://developer.android.com/training/sign-in/biometric-auth", tags: ["android", "mobile"] },
  { title: "Web.dev — Core Web Vitals", type: "Learning", url: "https://web.dev/articles/vitals", tags: ["performance"] },
  { title: "Stripe — idempotent requests", type: "Reference", url: "https://docs.stripe.com/api/idempotent_requests", tags: ["billing", "payments"] },
  { title: "Regex101", type: "Website", url: "https://regex101.com", tags: ["tools"] },
  { title: "Excalidraw", type: "Tool", url: "https://excalidraw.com", description: "Quick architecture sketches.", tags: ["design", "tools"] },
  { title: "Release checklist", type: "Link", url: "https://example.com/lumen/release-checklist", description: "Team wiki page (internal).", tags: ["release"] },
];

// ---------------------------------------------------------------- main
async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`${EMAIL} not found`);
  if (user.email !== EMAIL) throw new Error("Refusing to touch any other account.");
  const userId = user.id;
  console.log(`Resetting ${EMAIL} (${userId})…`);

  // 1. Wipe ONLY this account's records (children cascade).
  await prisma.$transaction([
    prisma.followUpUpdate.deleteMany({ where: { userId } }),
    prisma.followUpFile.deleteMany({ where: { userId } }),
    prisma.followUp.deleteMany({ where: { userId } }),
    prisma.task.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.link.deleteMany({ where: { userId } }),
    prisma.resource.deleteMany({ where: { userId } }),
    prisma.achievementFile.deleteMany({ where: { userId } }),
    prisma.achievement.deleteMany({ where: { userId } }),
    prisma.sprintReport.deleteMany({ where: { userId } }),
    prisma.ticketHistoryEntry.deleteMany({ where: { userId } }),
    prisma.ticketWorkUpdate.deleteMany({ where: { userId } }),
    prisma.workLogAttachment.deleteMany({ where: { userId } }),
    prisma.workLog.deleteMany({ where: { userId } }),
    prisma.ticket.deleteMany({ where: { userId } }),
    prisma.userList.deleteMany({ where: { userId } }),
  ]);

  // 2. Account: default sprint calendar. Name, password and sessions are left alone.
  await prisma.user.update({
    where: { id: userId },
    data: {
      sprintStartDate: null,
      sprintLengthDays: 14,
      ticketsEnabled: true,
    },
  });
  await prisma.userList.createMany({ data: [
    { userId, kind: "DefaultMeeting", values: MEETINGS },
    { userId, kind: "Project", values: PROJECTS },
  ] });

  // 3. Tickets.
  const ticketIds = new Map<string, string>();
  for (const plan of TICKETS) {
    const last = plan.updates.at(-1)!;
    const ticket = await prisma.ticket.create({
      data: { userId, ticketId: plan.key, title: plan.title, projectName: plan.project, status: last[1], createdAt: at(plan.updates[0]![0], 9), updatedAt: at(last[0], 17) },
    });
    ticketIds.set(plan.key, ticket.id);
  }

  // 4. Work logs: every weekday from 2 Sep to yesterday (10 Nov), minus a few gaps. Today is left empty to fill in.
  const MISSING = new Set(["2026-09-18", "2026-10-12", "2026-10-29"]);
  const OFF: Record<string, "Holiday" | "Leave"> = { "2026-10-02": "Holiday", "2026-10-16": "Leave" };
  const updatesByDay = new Map<string, Array<{ key: string; status: TicketStatus; text: string }>>();
  for (const plan of TICKETS) for (const [d, status, text] of plan.updates) {
    const list = updatesByDay.get(d) ?? [];
    list.push({ key: plan.key, status, text });
    updatesByDay.set(d, list);
  }
  let logs = 0;
  for (let d = "2026-09-02"; d < TODAY; d = addDays(d, 1)) {
    if (isWeekend(d) || MISSING.has(d)) continue;
    if (OFF[d]) {
      await prisma.workLog.create({ data: { userId, date: day(d), dayType: OFF[d], title: OFF[d] === "Holiday" ? "Public holiday" : "Annual leave", createdAt: at(d, 9), updatedAt: at(d, 9) } });
      logs += 1;
      continue;
    }
    const tickets = updatesByDay.get(d) ?? [];
    const learning = pick(LEARNING);
    const extra: [string, string] | null = SPRINT_STARTS[d] ? ["Sprint planning", SPRINT_STARTS[d]] : rand() < 0.3 ? pick(EXTRA_MEETINGS.filter(([name]) => name !== "Sprint planning")) : null;
    const titleBits = tickets.length ? tickets.slice(0, 2).map((t) => TICKETS.find((p) => p.key === t.key)!.title.split(" ").slice(0, 3).join(" ")) : ["Reviews and planning"];
    const summary = tickets.length && rand() < 0.6
      ? tickets.map((t) => `- **${t.key}** — ${t.text}`).join("\n")
      : null;
    const log = await prisma.workLog.create({
      data: {
        userId,
        date: day(d),
        title: titleBits.join(" | "),
        titleGenerated: false,
        learningNotes: learning,
        summary,
        summaryModel: summary ? "demo-seed" : null,
        summaryGeneratedAt: summary ? at(d, 18) : null,
        createdAt: at(d, 9),
        updatedAt: at(d, 18),
        meetings: { create: [
          { name: "Daily standup", notes: pick(STANDUP), order: 0, isDefault: true },
          ...(extra ? [{ name: extra[0], notes: extra[1], order: 1, isDefault: true }] : []),
        ] },
      },
    });
    for (const t of tickets) {
      await prisma.ticketWorkUpdate.create({ data: { userId, workLogId: log.id, ticketId: ticketIds.get(t.key)!, description: t.text, status: t.status, createdAt: at(d, 15), updatedAt: at(d, 15) } });
    }
    logs += 1;
  }
  // A couple of standalone history notes (outside any log).
  await prisma.ticketHistoryEntry.createMany({ data: [
    { userId, ticketId: ticketIds.get("LUM-142")!, body: "Support lead asked for a CSV export of the failed-charge list — parked for the next sprint.", status: "SentToQA", createdAt: at("2026-10-26", 11) },
    { userId, ticketId: ticketIds.get("LUM-149")!, body: "Elena: square crops, 1:1, face centred; she'll send the guide by Tuesday.", status: "InProgress", createdAt: at("2026-10-31", 10) },
  ] });

  // 5. Tracker — to-dos (Work), personal to-dos, follow-ups, notes.
  type Todo = { subject: string; due?: string; done?: string; pinned?: boolean; personal?: boolean; ticket?: string };
  const TODOS: Todo[] = [
    { subject: "Fix the flaky appointment-reminder test in CI", due: "2026-11-06", pinned: true, ticket: "LUM-118" },
    { subject: "Update API docs for POST /billing/retry", due: "2026-11-08", ticket: "LUM-142" },
    { subject: "Review Elena's onboarding flow mockups", due: TODAY },
    { subject: "Write demo notes for sprint review", due: TODAY },
    { subject: "Pair with Kenji on the Node 22 staging deploy", due: "2026-11-13", ticket: "LUM-151" },
    { subject: "Migration: add invoice_status index", due: "2026-11-14" },
    { subject: "Sprint review demo — payment retry dashboard", due: "2026-11-16", pinned: true },
    { subject: "Retro notes", due: "2026-11-20" },
    { subject: "Explore React Server Components for the portal" },
    { subject: "Clean up old feature flags (reminders_v1, legacy_pdf)" },
    // finished this week / sprint
    { subject: "Rebase the clinician-photos branch", due: "2026-11-07", done: "2026-11-07T11:20:00Z" },
    { subject: "Answer Marcus's QA questions on retry-now", due: "2026-11-07", done: "2026-11-07T15:05:00Z" },
    { subject: "Book the sprint review room", due: "2026-11-08", done: "2026-11-08T09:40:00Z" },
    { subject: "Fix timezone bug in the age filter", due: "2026-11-08", done: "2026-11-08T16:30:00Z" },
    { subject: "Review Kenji's Terraform PR", due: "2026-11-09", done: "2026-11-09T10:15:00Z" },
    { subject: "Send release notes for 2.19", due: "2026-11-09", done: "2026-11-09T17:45:00Z" },
    { subject: "Draft the Q4 tech-debt list", due: "2026-11-06", done: "2026-11-06T14:00:00Z" },
    { subject: "Update emergency-contacts copy", due: "2026-11-05", done: "2026-11-05T12:10:00Z" },
    { subject: "Write the incident summary for the SMS outage", due: "2026-10-31", done: "2026-10-31T16:00:00Z" },
    // personal
    { subject: "Book dentist appointment — ask about Saturday slots", personal: true },
    { subject: "Renew passport (check the photo rules first)", personal: true, due: "2026-11-25" },
    { subject: "Birthday gift for Mum", personal: true, due: "2026-11-18", pinned: true },
    { subject: "Plan a weekend hike", personal: true },
  ];
  for (const todo of TODOS) {
    await prisma.followUp.create({ data: {
      userId, kind: "Task", subject: todo.subject, personal: Boolean(todo.personal), pinned: Boolean(todo.pinned), ticketKey: todo.ticket ?? null,
      dueDate: todo.due ? day(todo.due) : null,
      status: todo.done ? "Done" : "Open",
      completedAt: todo.done ? new Date(todo.done) : null,
      createdAt: at(todo.due ? addDays(todo.due, -3) : "2026-10-30", 9),
      updatedAt: todo.done ? new Date(todo.done) : at("2026-11-10", 9),
    } });
  }

  type Follow = { person: string; subject: string; due?: string; done?: string; ticket?: string; pinned?: boolean; updates: Array<{ at: string; note: string; fromThem?: boolean; channel?: string }> };
  const FOLLOWS: Follow[] = [
    { person: "Priya", subject: "Sign-off on the new reminder copy", due: "2026-11-09", updates: [
      { at: "2026-11-06T10:00:00Z", note: "Sent Priya the three copy options for the 24h reminder." },
      { at: "2026-11-09T14:20:00Z", note: "Option B, but drop the emoji. Approved.", fromThem: true },
    ] },
    { person: "Marcus", subject: "QA pass on LUM-142 retry logic", due: "2026-11-12", ticket: "LUM-142", updates: [
      { at: "2026-11-07T16:00:00Z", note: "Timezone fix is on staging — could you re-run the age-filter cases?" },
    ] },
    { person: "Kenji", subject: "Rotate the staging DB credentials", due: "2026-11-09", pinned: true, updates: [
      { at: "2026-11-05T09:30:00Z", note: "The staging DB password is in the old vault — can we rotate before the Node 22 deploy?", channel: "Teams" },
    ] },
    { person: "Elena", subject: "Final icons for the mobile tab bar", due: "2026-11-15", ticket: "LUM-153", updates: [
      { at: "2026-11-08T13:00:00Z", note: "Need the five tab icons as 24px SVGs, 1.5px stroke." },
    ] },
    { person: "Fatima", subject: "Decision on partitioning lab_results", due: "2026-11-10", updates: [
      { at: "2026-11-02T11:00:00Z", note: "Shared the benchmark: index alone gets us to 520ms. Partition now or later?", channel: "Meeting" },
      { at: "2026-11-10T09:10:00Z", note: "Later — revisit at 50M rows. Close it for now.", fromThem: true },
    ] },
    { person: "Support (Jo)", subject: "Feedback on the retry dashboard filters", due: "2026-11-14", updates: [
      { at: "2026-11-09T15:30:00Z", note: "Walked Jo through the dashboard; asked for feedback by Wednesday.", channel: "Call" },
    ] },
    { person: "Vendor (TextLink)", subject: "SMS pricing quote for 2027", done: "2026-10-30T12:00:00Z", updates: [
      { at: "2026-10-23T10:00:00Z", note: "Asked for volume pricing above 200k/month.", channel: "Email" },
      { at: "2026-10-30T11:40:00Z", note: "Quote attached — 18% lower above 200k.", fromThem: true, channel: "Email" },
    ] },
    { person: "Kenji", subject: "Access to the Sentry project", done: "2026-10-18T10:00:00Z", updates: [
      { at: "2026-10-17T09:00:00Z", note: "Could you add me to the mobile Sentry project?" },
      { at: "2026-10-18T09:55:00Z", note: "Done — you're an admin now.", fromThem: true },
    ] },
  ];
  for (const f of FOLLOWS) {
    await prisma.followUp.create({ data: {
      userId, kind: "FollowUp", person: f.person, subject: f.subject, ticketKey: f.ticket ?? null, pinned: Boolean(f.pinned),
      dueDate: f.due ? day(f.due) : null,
      status: f.done ? "Done" : "Open",
      completedAt: f.done ? new Date(f.done) : null,
      createdAt: new Date(f.updates[0]!.at),
      updatedAt: new Date(f.updates.at(-1)!.at),
      updates: { create: f.updates.map((u) => ({ userId, note: u.note, fromThem: Boolean(u.fromThem), channel: u.channel ?? "Slack", occurredAt: new Date(u.at), createdAt: new Date(u.at) })) },
    } });
  }

  const NOTES_TRACKER: Array<{ subject: string; tags: string[]; note: string; pinned?: boolean }> = [
    { subject: "Retro ideas", tags: ["retro"], note: "Release train worked well. Staging DB is too slow for QA — ask for a bigger instance.", pinned: true },
    { subject: "1:1 topics with Fatima", tags: ["1on1"], note: "Career: path to senior. Ask about owning the billing roadmap next quarter." },
    { subject: "Things to automate", tags: ["dx"], note: "Seed data for QA patients; a script to rotate staging secrets." },
    { subject: "Performance budget", tags: ["perf"], note: "Portal pages: LCP < 2.5s on 4G, JS < 200kB per route." },
  ];
  for (const n of NOTES_TRACKER) {
    await prisma.followUp.create({ data: {
      userId, kind: "Note", subject: n.subject, tags: n.tags, pinned: Boolean(n.pinned), createdAt: at("2026-11-01", 10), updatedAt: at("2026-11-09", 10),
      updates: { create: [{ userId, note: n.note, channel: "Other", occurredAt: at("2026-11-09", 10), createdAt: at("2026-11-09", 10) }] },
    } });
  }

  // 5b. Follow-ups that are a record, not a chase: "I told" (no reminder) and
  // "They told me" (first message from them, so it opens in Your turn).
  await prisma.followUp.create({ data: {
    userId, kind: "FollowUp", person: "Priya", subject: "Release 2.20 moves to Thursday",
    createdAt: new Date("2026-11-09T11:00:00Z"), updatedAt: new Date("2026-11-09T11:00:00Z"),
    updates: { create: [{ userId, note: "Told Priya release 2.20 moves to Thursday so QA can finish the retry dashboard.", channel: "Slack", occurredAt: new Date("2026-11-09T11:00:00Z"), createdAt: new Date("2026-11-09T11:00:00Z") }] },
  } });
  await prisma.followUp.create({ data: {
    userId, kind: "FollowUp", person: "Fatima", subject: "Year-end code freeze starts 20 Nov",
    createdAt: new Date("2026-11-10T09:15:00Z"), updatedAt: new Date("2026-11-10T09:15:00Z"),
    updates: { create: [{ userId, note: "Code freeze for the year-end release starts Friday 20 Nov — anything not merged by then waits for January.", fromThem: true, channel: "Meeting", occurredAt: new Date("2026-11-10T09:15:00Z"), createdAt: new Date("2026-11-10T09:15:00Z") }] },
  } });

  // 5c. Minutes of meeting: Tracker notes tagged #mom, linked from that day's Sprint planning card.
  const MINUTES: Array<{ date: string; subject: string; html: string }> = [
    { date: "2026-10-14", subject: "Sprint planning — 14 Oct", html: [
      "<p><strong>Attendees:</strong> Priya (PO), Fatima (EM), Kenji, Marcus, Elena, me</p>",
      "<h2>Sprint goal</h2><p>Payment retry dashboard on staging for support review.</p>",
      "<h2>Committed</h2><ul><li>LUM-142 Payment retry dashboard — me</li><li>LUM-145 Emergency contacts — me</li><li>LUM-153 Tab bar spike — Elena + me</li></ul>",
      "<h2>Decisions</h2><ul><li>Retry-now must be idempotent before it goes to support.</li><li>Emergency contacts ships without bulk import.</li></ul>",
      "<h2>Actions</h2><ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"true\"><p>Kenji: staging capacity request</p></li><li data-type=\"taskItem\" data-checked=\"true\"><p>Me: read-model draft by Wednesday</p></li></ul>",
    ].join("") },
    { date: "2026-10-28", subject: "Sprint planning — 28 Oct", html: [
      "<p><strong>Attendees:</strong> Priya (PO), Fatima (EM), Kenji, Marcus, Elena, me</p>",
      "<h2>Sprint goal</h2><p>Release the payment retry dashboard.</p>",
      "<h2>Committed</h2><ul><li>LUM-142 QA fixes and release — me</li><li>LUM-149 Clinician photos — me</li><li>LUM-151 Node 22 upgrade — me + Kenji</li></ul>",
      "<h2>Decisions</h2><ul><li>Clinician photos go behind the <code>clinician_photos</code> flag.</li><li>Node 22 soaks on staging for a week before production.</li></ul>",
      "<h2>Actions</h2><ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"true\"><p>Elena: photo crop guide</p></li><li data-type=\"taskItem\" data-checked=\"false\"><p>Kenji: rotate staging DB credentials</p></li><li data-type=\"taskItem\" data-checked=\"false\"><p>Me: API docs for POST /billing/retry</p></li></ul>",
    ].join("") },
  ];
  for (const m of MINUTES) {
    const meeting = await prisma.meeting.findFirst({ where: { name: "Sprint planning", workLog: { userId, date: day(m.date) } }, select: { id: true } });
    const doc = toDoc(m.html);
    const text = m.html.replace(/<\/(p|h2|li)>/g, "\n").replace(/<[^>]+>/g, "").replace(/\n+/g, "\n").trim();
    await prisma.followUp.create({ data: {
      userId, kind: "Note", subject: m.subject, tags: ["mom"], createdAt: at(m.date, 11), updatedAt: at(m.date, 11),
      updates: { create: [{ userId, note: text, doc, channel: "Other", occurredAt: at(m.date, 11), createdAt: at(m.date, 11) }] },
      ...(meeting ? { meetingLinks: { create: [{ meetingId: meeting.id }] } } : {}),
    } });
  }

  // 6. Notebooks.
  for (const [index, note] of NOTEBOOKS.entries()) {
    await prisma.note.create({ data: {
      userId, title: note.title, description: note.description, iconName: note.iconName, iconLibrary: note.iconLibrary, favorite: Boolean(note.favorite),
      createdAt: at(addDays("2026-09-10", index * 9), 12), updatedAt: at(addDays("2026-10-20", index * 3), 12),
      sections: { create: note.sections.map((section, s) => ({
        title: section.title, order: s,
        pages: { create: section.pages.map((page, p) => ({ title: page.title, order: p, content: toDoc(page.html) })) },
      })) },
    } });
  }

  // 7. Resources.
  for (const [index, r] of RESOURCES.entries()) {
    await prisma.resource.create({ data: {
      userId, title: r.title, type: r.type, url: r.url ?? null, content: r.content ?? "", description: r.description ?? "", tags: r.tags, favorite: Boolean(r.favorite),
      createdAt: at(addDays("2026-09-05", index * 4), 10), updatedAt: at(addDays("2026-09-05", index * 4), 10),
    } });
  }

  // 8. Achievements.
  await prisma.achievement.createMany({ data: [
    { userId, title: "AWS Certified Developer – Associate", type: "Certification", status: "Completed", assignedBy: "Amazon Web Services", startDate: day("2026-07-01"), endDate: day("2026-08-12"), description: "Passed with 871/1000. Focus areas: Lambda, DynamoDB, SQS." },
    { userId, title: "Testing JavaScript", type: "Course", status: "Completed", assignedBy: "Online course", startDate: day("2026-05-04"), endDate: day("2026-06-20"), description: "Unit, integration and end-to-end testing; applied to the portal's booking flow." },
    { userId, title: "Hack Week winner — smart reminders", type: "Hackathon", status: "Completed", assignedBy: "Lumen Health", startDate: day("2026-03-16"), endDate: day("2026-03-20"), description: "Prototype that picks the best reminder time per patient; now on the roadmap." },
    { userId, title: "Promoted to Software Engineer II", type: "Promotion", status: "Completed", assignedBy: "Lumen Health", endDate: day("2026-04-01"), description: "After leading the billing retry work." },
    { userId, title: "Kubernetes for Developers", type: "Course", status: "InProgress", assignedBy: "Online course", startDate: day("2026-10-05"), description: "Module 4 of 7 — deployments and rollouts." },
  ] });

  // 9. 5-15 reports for the three previous sprints.
  await prisma.sprintReport.createMany({ data: [
    { userId, sprintStart: day("2026-09-30"), model: "demo-seed", generatedAt: at("2026-10-13", 17), content: [
      "# 5-15 Report", "(30 Sep – 13 Oct 2026)",
      "## Completed This Week",
      "### LUM-131 — Lab results performance", "- Added a composite index; page load 4.1s → 380ms on staging", "- Cursor pagination for long histories; released (p95 520ms)",
      "### LUM-135 — Biometric login on Android 14", "- Recreate keys after invalidation, PIN fallback", "- Rolled out to 100% with no crash spikes",
      "### LUM-138 — Invoice tax rounding", "- Tax computed once on the total, remainder on the last instalment",
      "## Problems or Blockers", "- Staging database is slow under QA load",
    ].join("\n") },
    { userId, sprintStart: day("2026-10-14"), model: "demo-seed", generatedAt: at("2026-10-27", 17), content: [
      "# 5-15 Report", "(14 Oct – 27 Oct 2026)",
      "## Completed This Week",
      "### LUM-142 — Payment retry dashboard", "- Read model, filters and idempotent retry-now", "- On staging for QA and support review",
      "### LUM-145 — Emergency contacts", "- Form, validation and audit log; approved for release",
      "### LUM-138 — Invoice tax rounding", "- Released; finance reconciled last week's invoices",
      "## Problems or Blockers", "- Waiting on staging DB credential rotation (Kenji)",
    ].join("\n") },
    { userId, sprintStart: day("2026-10-28"), model: "demo-seed", generatedAt: at("2026-11-10", 17), content: [
      "# 5-15 Report", "(28 Oct – 10 Nov 2026)",
      "## Completed This Week",
      "### LUM-142 — Payment retry dashboard", "- Age filter now uses the clinic's timezone; back in QA with Marcus",
      "### LUM-149 — Clinician photos", "- Resize to 160px WebP, lazy-load, crop guide applied; on staging behind a flag",
      "### LUM-151 — Node 22 LTS", "- CI green, snapshot tests fixed, load test shows no regression",
      "## Problems or Blockers", "- Staging DB credentials still not rotated (Kenji)", "- Year-end code freeze from 20 Nov",
    ].join("\n") },
  ] });

  const counts = await Promise.all([
    prisma.workLog.count({ where: { userId } }), prisma.ticket.count({ where: { userId } }), prisma.followUp.count({ where: { userId } }),
    prisma.note.count({ where: { userId } }), prisma.resource.count({ where: { userId } }), prisma.achievement.count({ where: { userId } }), prisma.sprintReport.count({ where: { userId } }),
  ]);
  console.log(`Done: ${logs} work logs (${counts[0]}), ${counts[1]} tickets, ${counts[2]} tracker entries, ${counts[3]} notebooks, ${counts[4]} resources, ${counts[5]} achievements, ${counts[6]} reports.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
