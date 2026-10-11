/**
 * Dummy notes, authored as HTML.
 *
 * The pages below are written as plain HTML and converted to TipTap JSON at
 * seed time with `generateJSON`, using the SAME extension list the editor runs
 * (`buildNoteExtensions`). That matters: anything the extensions don't know
 * about is dropped on conversion, so what seeds is exactly what the editor can
 * round-trip — no hand-written node JSON to drift out of sync.
 *
 *   npm run db:seed:notes
 *
 * Re-runnable: it removes its own notes by title first, so it never piles up
 * duplicates, and it touches nothing else.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateJSON } from "@tiptap/html/server";

import { buildNoteExtensions } from "../src/components/notes/editor-extensions";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const extensions = buildNoteExtensions();

const toDoc = (html: string) => generateJSON(html, extensions);

type SeedPage = { title: string; html: string };
type SeedSection = { title: string; pages: SeedPage[] };
type SeedNote = {
  title: string;
  description: string;
  iconName?: string;
  iconLibrary?: string;
  favorite?: boolean;
  sections: SeedSection[];
};

const NOTES: SeedNote[] = [
  {
    title: "Worker deploy runbook",
    description: "Everything needed to ship the queue worker without waking anyone up.",
    iconName: "LuRocket",
    iconLibrary: "lu",
    favorite: true,
    sections: [
      {
        title: "Deploy",
        pages: [
          {
            title: "Steps",
            html: `
              <h2>Before you start</h2>
              <p>Check <strong>#deploys</strong> is quiet and that nobody is mid-migration. If the queue is deeper than <mark>5k</mark> messages, wait for it to drain first.</p>
              <ol>
                <li>SSH to the box: <code>ssh worker-01</code></li>
                <li>Pull and install</li>
                <li>Reload the process, do <em>not</em> restart it</li>
                <li>Watch the queue for five minutes</li>
              </ol>
              <pre><code class="language-bash">cd /srv/worker
git pull --ff-only
npm ci --omit=dev
pm2 reload worker --update-env
pm2 logs worker --lines 50</code></pre>
              <blockquote><p>A reload drains in-flight jobs. A restart drops them, and they will not be retried.</p></blockquote>
            `,
          },
          {
            title: "Rollback",
            html: `
              <p>If the error rate climbs for more than two minutes, roll back first and investigate afterwards.</p>
              <pre><code class="language-bash">git reset --hard HEAD~1
npm ci --omit=dev
pm2 reload worker</code></pre>
              <ul>
                <li>Post in <strong>#billing</strong> before anyone has to ask</li>
                <li>Re-run reconciliation from the last clean checkpoint</li>
                <li>Open a ticket the same day, while you still remember the detail</li>
              </ul>
            `,
          },
        ],
      },
      {
        title: "Checks",
        pages: [
          {
            title: "Post-deploy checklist",
            html: `
              <ul data-type="taskList">
                <li data-type="taskItem" data-checked="true"><p>Queue depth back under 500</p></li>
                <li data-type="taskItem" data-checked="true"><p>No new entries in the dead-letter queue</p></li>
                <li data-type="taskItem" data-checked="false"><p>Error rate flat for 30 minutes</p></li>
                <li data-type="taskItem" data-checked="false"><p>Reconciliation run clean</p></li>
                <li data-type="taskItem" data-checked="false"><p>Note the release in the work log</p></li>
              </ul>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "Postgres, the bits I keep forgetting",
    description: "Queries and settings I look up more than twice a month.",
    iconName: "SiPostgresql",
    iconLibrary: "si",
    favorite: true,
    sections: [
      {
        title: "Diagnosing",
        pages: [
          {
            title: "Find the slow ones",
            html: `
              <p>Needs <code>pg_stat_statements</code>. Sorted by total time, not mean — the query that runs ten thousand times is usually the problem, not the one that takes two seconds once.</p>
              <pre><code class="language-sql">SELECT calls,
       round(total_exec_time::numeric, 1) AS total_ms,
       round(mean_exec_time::numeric, 2)  AS mean_ms,
       query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;</code></pre>
              <h3>Reading a plan</h3>
              <p>Always <code>EXPLAIN (ANALYZE, BUFFERS)</code>. A plan without <strong>ANALYZE</strong> is a guess.</p>
            `,
          },
          {
            title: "Locks and blocking",
            html: `
              <p>When something hangs, find who is holding what before you kill anything.</p>
              <pre><code class="language-sql">SELECT blocked.pid    AS blocked_pid,
       blocked.query  AS blocked_query,
       blocking.pid   AS blocking_pid,
       blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;</code></pre>
              <blockquote><p>Prefer <code>pg_cancel_backend</code> over <code>pg_terminate_backend</code>. Cancel asks; terminate takes the whole connection down.</p></blockquote>
            `,
          },
        ],
      },
      {
        title: "Reference",
        pages: [
          {
            title: "Index types",
            html: `
              <table>
                <tbody>
                  <tr><th><p>Type</p></th><th><p>Good for</p></th><th><p>Avoid when</p></th></tr>
                  <tr><td><p>B-tree</p></td><td><p>Equality and ranges. The default, and right most of the time.</p></td><td><p>Full-text, arrays, containment</p></td></tr>
                  <tr><td><p>GIN</p></td><td><p>Arrays, JSONB containment, full-text</p></td><td><p>Write-heavy tables — inserts get expensive</p></td></tr>
                  <tr><td><p>BRIN</p></td><td><p>Huge tables stored roughly in order, e.g. by timestamp</p></td><td><p>Rows arrive out of order</p></td></tr>
                  <tr><td><p>Partial</p></td><td><p>A hot slice, e.g. <code>WHERE deleted_at IS NULL</code></p></td><td><p>The predicate changes often</p></td></tr>
                </tbody>
              </table>
              <p>Check what is actually used before adding another: <code>pg_stat_user_indexes</code> shows <code>idx_scan = 0</code> for every index nobody needs.</p>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "Interview loop — backend",
    description: "The questions worth asking, and what a good answer sounds like.",
    iconName: "LuUsers",
    iconLibrary: "lu",
    sections: [
      {
        title: "Structure",
        pages: [
          {
            title: "The 45 minutes",
            html: `
              <ol>
                <li><strong>5 min</strong> — what they are working on now, in their words</li>
                <li><strong>20 min</strong> — one real problem from our codebase, simplified</li>
                <li><strong>15 min</strong> — trade-offs: what would you do differently at ten times the traffic?</li>
                <li><strong>5 min</strong> — their questions, which tell you more than the rest</li>
              </ol>
              <blockquote><p>If you are talking more than a third of the time, the interview is going badly and it is your fault.</p></blockquote>
            `,
          },
          {
            title: "Signals",
            html: `
              <h3>Good</h3>
              <ul>
                <li>Asks what the data looks like before designing anything</li>
                <li>Says "I don't know" and then reasons out loud anyway</li>
                <li>Names the trade-off they are choosing, not just the choice</li>
              </ul>
              <h3>Worrying</h3>
              <ul>
                <li>Reaches for a queue, a cache and a new service in the first two minutes</li>
                <li>Cannot explain something on their own CV</li>
                <li>Treats the existing code in the prompt as obviously stupid</li>
              </ul>
            `,
          },
        ],
      },
    ],
  },
];

async function main() {
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error("No user found. Run `npm run db:seed` first.");
    process.exitCode = 1;
    return;
  }

  const titles = NOTES.map((note) => note.title);

  // Re-runnable: clear this script's own notes, leave everything else alone.
  const removed = await prisma.note.deleteMany({
    where: { userId: user.id, title: { in: titles } },
  });

  for (const note of NOTES) {
    await prisma.note.create({
      data: {
        userId: user.id,
        title: note.title,
        description: note.description,
        iconName: note.iconName ?? null,
        iconLibrary: note.iconLibrary ?? null,
        favorite: note.favorite ?? false,
        sections: {
          create: note.sections.map((section, sectionOrder) => ({
            title: section.title,
            order: sectionOrder,
            pages: {
              create: section.pages.map((page, pageOrder) => ({
                title: page.title,
                order: pageOrder,
                content: toDoc(page.html),
              })),
            },
          })),
        },
      },
    });
  }

  const pages = NOTES.reduce(
    (total, note) =>
      total + note.sections.reduce((n, section) => n + section.pages.length, 0),
    0,
  );

  console.log(
    `Seeded ${NOTES.length} notes (${pages} pages) for ${user.email}` +
      (removed.count ? ` — replaced ${removed.count} existing` : ""),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
