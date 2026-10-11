/**
 * Fill ONE account's Notes and Resources with IT study content (AI, AWS,
 * Python, JavaScript), so the Notes
 * editor (note → sections → pages) and the Resources library have plenty to show.
 *
 *   npm run db:seed:workspace                      -> tariboi36@gmail.com
 *   npm run db:seed:workspace -- someone@mail.com  -> another existing account
 *
 * Pages are authored as HTML and converted with the editor's own extensions
 * (same approach as seed-notes.ts), so everything round-trips in the editor.
 * Re-runnable: it replaces only its own notes/resources (matched by title) for
 * that account and leaves everything else alone.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateJSON } from "@tiptap/html/server";

import { buildNoteExtensions } from "../src/components/notes/editor-extensions";
import { PrismaClient } from "../src/generated/prisma/client";

const DEFAULT_EMAIL = "tariboi36@gmail.com";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const extensions = buildNoteExtensions();
const toDoc = (html: string) => generateJSON(html, extensions);

type SeedNote = {
  title: string;
  description: string;
  iconName: string;
  iconLibrary: "lu" | "si" | "fa6";
  favorite?: boolean;
  sections: Array<{ title: string; pages: Array<{ title: string; html: string }> }>;
};

const NOTES: SeedNote[] = [
  {
    title: "AI & LLM fundamentals",
    description: "How large language models work and how to build with them.",
    iconName: "SiClaude",
    iconLibrary: "si",
    favorite: true,
    sections: [
      {
        title: "Core concepts",
        pages: [
          {
            title: "Tokens and context",
            html: `
              <h2>Everything is tokens</h2>
              <p>Models read and write <strong>tokens</strong> — roughly ¾ of a word in English. Pricing, speed and limits are all counted in tokens.</p>
              <ul>
                <li><strong>Context window</strong> — how many tokens fit in one request (prompt + answer)</li>
                <li><strong>Temperature</strong> — 0 for repeatable answers, higher for variety</li>
                <li><strong>Max tokens</strong> — caps the length of the reply</li>
              </ul>
              <p><mark>Long context is not memory.</mark> Each request only knows what you send in it.</p>
            `,
          },
          {
            title: "Embeddings",
            html: `
              <h2>Text as vectors</h2>
              <p>An embedding turns text into a list of numbers. Similar meaning → vectors close together.</p>
              <ol>
                <li>Embed your documents once and store the vectors</li>
                <li>Embed the user's question</li>
                <li>Find the nearest documents with cosine similarity</li>
              </ol>
            `,
          },
        ],
      },
      {
        title: "Building",
        pages: [
          {
            title: "RAG in five steps",
            html: `
              <h2>Retrieval-augmented generation</h2>
              <ol>
                <li>Split documents into chunks (300–800 tokens, with overlap)</li>
                <li>Embed chunks into a vector store</li>
                <li>Retrieve the top-k chunks for each question</li>
                <li>Put them in the prompt with clear instructions</li>
                <li>Ask the model to cite which chunk it used</li>
              </ol>
              <p>Most quality problems are <em>retrieval</em> problems, not model problems.</p>
            `,
          },
          {
            title: "Tool use",
            html: `
              <h2>Letting the model call functions</h2>
              <p>Describe each tool with a name, a clear description and a JSON schema. The model returns a tool call; your code runs it and sends the result back.</p>
              <ul>
                <li>Keep tools small and single-purpose</li>
                <li>Validate every argument — treat model output as untrusted input</li>
              </ul>
            `,
          },
        ],
      },
      {
        title: "Evaluation",
        pages: [
          {
            title: "Testing prompts",
            html: `
              <h2>Measure before you tweak</h2>
              <ul>
                <li>Keep a set of 20–50 real inputs with expected outcomes</li>
                <li>Re-run the set after every prompt change</li>
                <li>Track pass rate, cost and latency together</li>
              </ul>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "Prompt engineering",
    description: "Patterns that make model output reliable.",
    iconName: "LuSparkles",
    iconLibrary: "lu",
    sections: [
      {
        title: "Patterns",
        pages: [
          {
            title: "Structure a prompt",
            html: `
              <h2>A prompt that works</h2>
              <ol>
                <li><strong>Role and goal</strong> — who the model is, what done looks like</li>
                <li><strong>Context</strong> — the data, wrapped in clear tags</li>
                <li><strong>Constraints</strong> — format, length, what to avoid</li>
                <li><strong>Examples</strong> — one or two good outputs</li>
              </ol>
              <pre><code>&lt;document&gt;
{{ticket_text}}
&lt;/document&gt;
Summarise the ticket in 3 bullet points for a stand-up.</code></pre>
            `,
          },
          {
            title: "Structured output",
            html: `
              <p>Ask for JSON that matches a schema, then <strong>parse and validate</strong> it. Retry once with the validation error if it fails.</p>
            `,
          },
        ],
      },
      {
        title: "Pitfalls",
        pages: [
          {
            title: "Common mistakes",
            html: `
              <ul>
                <li>Vague instructions — "make it better" instead of what better means</li>
                <li>Contradicting rules in different parts of the prompt</li>
                <li>Pasting untrusted text without marking it as data</li>
                <li>Changing the prompt without re-running the eval set</li>
              </ul>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "AWS essentials",
    description: "The services I use most, and how they fit together.",
    iconName: "FaAws",
    iconLibrary: "fa6",
    favorite: true,
    sections: [
      {
        title: "Core services",
        pages: [
          {
            title: "Compute & storage",
            html: `
              <h2>Pick the right box</h2>
              <ul>
                <li><strong>EC2</strong> — full virtual machines, you manage the OS</li>
                <li><strong>Lambda</strong> — functions, pay per request, 15-minute limit</li>
                <li><strong>ECS / Fargate</strong> — containers without managing servers</li>
                <li><strong>S3</strong> — object storage; static sites, uploads, backups</li>
                <li><strong>RDS</strong> — managed Postgres / MySQL</li>
              </ul>
            `,
          },
          {
            title: "Networking",
            html: `
              <h2>VPC basics</h2>
              <ol>
                <li>Public subnets: load balancers, NAT gateway</li>
                <li>Private subnets: apps and databases</li>
                <li>Security groups allow traffic by port and source</li>
              </ol>
              <p><mark>Never</mark> put a database in a public subnet.</p>
            `,
          },
        ],
      },
      {
        title: "IAM",
        pages: [
          {
            title: "Least privilege",
            html: `
              <h2>Permissions checklist</h2>
              <ul>
                <li>No access keys on the root account; turn on MFA</li>
                <li>Give services <strong>roles</strong>, not long-lived keys</li>
                <li>Start with narrow policies and widen only when something fails</li>
              </ul>
              <pre><code>{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::my-bucket/uploads/*"
}</code></pre>
            `,
          },
        ],
      },
      {
        title: "Cost",
        pages: [
          {
            title: "Keeping the bill small",
            html: `
              <ul>
                <li>Set a budget alert on day one</li>
                <li>Stop dev instances out of hours</li>
                <li>S3 lifecycle rules: move old files to cheaper storage</li>
                <li>Delete unattached EBS volumes and old snapshots</li>
              </ul>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "AWS Lambda & serverless",
    description: "Building and deploying functions.",
    iconName: "LuZap",
    iconLibrary: "lu",
    sections: [
      {
        title: "Lambda",
        pages: [
          {
            title: "Handler basics",
            html: `
              <pre><code>export const handler = async (event) =&gt; {
  const body = JSON.parse(event.body ?? "{}");
  return { statusCode: 200, body: JSON.stringify({ ok: true, body }) };
};</code></pre>
              <p>Create SDK clients <strong>outside</strong> the handler so warm invocations reuse them.</p>
            `,
          },
          {
            title: "Cold starts",
            html: `
              <ul>
                <li>Keep the bundle small — tree-shake the AWS SDK v3 clients</li>
                <li>More memory also means more CPU</li>
                <li>Provisioned concurrency for latency-sensitive endpoints</li>
              </ul>
            `,
          },
        ],
      },
      {
        title: "Patterns",
        pages: [
          {
            title: "Event-driven",
            html: `
              <ol>
                <li>API Gateway → Lambda for HTTP</li>
                <li>S3 upload → Lambda to resize or scan files</li>
                <li>SQS → Lambda for background jobs with retries</li>
                <li>EventBridge schedule for cron jobs</li>
              </ol>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "Python toolkit",
    description: "Everyday Python: environments, idioms and scripts.",
    iconName: "SiPython",
    iconLibrary: "si",
    sections: [
      {
        title: "Setup",
        pages: [
          {
            title: "Virtual environments",
            html: `
              <pre><code>python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt</code></pre>
              <p>One venv per project. Never <code>sudo pip install</code>.</p>
            `,
          },
        ],
      },
      {
        title: "Idioms",
        pages: [
          {
            title: "Comprehensions",
            html: `
              <pre><code>active = [u.email for u in users if u.active]
by_id = {u.id: u for u in users}</code></pre>
              <p>If it doesn't fit on one readable line, use a normal loop.</p>
            `,
          },
          {
            title: "Dataclasses & typing",
            html: `
              <pre><code>from dataclasses import dataclass

@dataclass
class Ticket:
    key: str
    title: str
    status: str = "In progress"</code></pre>
            `,
          },
        ],
      },
      {
        title: "Scripting",
        pages: [
          {
            title: "Calling an API",
            html: `
              <pre><code>import requests

res = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
res.raise_for_status()
data = res.json()</code></pre>
              <p>Always set a <strong>timeout</strong> — the default waits forever.</p>
            `,
          },
          {
            title: "boto3 quick start",
            html: `
              <pre><code>import boto3

s3 = boto3.client("s3")
for obj in s3.list_objects_v2(Bucket="my-bucket").get("Contents", []):
    print(obj["Key"], obj["Size"])</code></pre>
            `,
          },
        ],
      },
    ],
  },
  {
    title: "JavaScript deep dive",
    description: "Closures, async, the event loop and modern syntax.",
    iconName: "SiJavascript",
    iconLibrary: "si",
    sections: [
      {
        title: "Fundamentals",
        pages: [
          {
            title: "Closures",
            html: `
              <pre><code>function counter() {
  let count = 0;
  return () =&gt; ++count;
}
const next = counter();
next(); // 1
next(); // 2</code></pre>
              <p><code>count</code> lives on because the returned function still references it.</p>
            `,
          },
          {
            title: "this and arrow functions",
            html: `
              <ul>
                <li>Regular functions get <code>this</code> from how they're called</li>
                <li>Arrow functions take <code>this</code> from where they're defined</li>
                <li>Use arrows for callbacks; methods for objects</li>
              </ul>
            `,
          },
        ],
      },
      {
        title: "Async",
        pages: [
          {
            title: "Promises & async/await",
            html: `
              <pre><code>const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);</code></pre>
              <p>Use <code>Promise.allSettled</code> when one failure shouldn't cancel the rest.</p>
            `,
          },
          {
            title: "Event loop",
            html: `
              <ol>
                <li>Synchronous code</li>
                <li>Microtasks — promise callbacks, <code>queueMicrotask</code></li>
                <li>Macrotasks — <code>setTimeout</code>, I/O</li>
              </ol>
            `,
          },
        ],
      },
      {
        title: "Modern syntax",
        pages: [
          {
            title: "Handy operators",
            html: `
              <pre><code>const city = user?.address?.city ?? "Unknown";
const { id, ...rest } = payload;
const merged = { ...defaults, ...options };</code></pre>
            `,
          },
        ],
      },
    ],
  },
];

/** Titles from the previous version of this seed, removed so they don't linger. */
const RETIRED_NOTE_TITLES = ["Drupal 11 upgrade playbook", "SMTP setup for CMS sites", "Sprint rituals", "JavaScript concepts", "Git workflows", "Client sites overview"];
const RETIRED_RESOURCE_TITLES = [
  "Drupal 11 release notes", "Upgrade Status module", "Drupal API reference", "Clear cache and run updates", "Watch the watchdog log",
  "Composer: upgrade core to 11", "Messenger service instead of drupal_set_message", "Debounce helper", "Google app passwords",
  "MDN — Closures", "MDN — Using promises", "Git reference", "Can I use", "Regex101", "Tailwind CSS docs", "Slack", "Sprint board",
];

type SeedResource = { title: string; description: string; type: string; url?: string; content?: string; tags: string[] };

const RESOURCES: SeedResource[] = [
  // AI
  { title: "Anthropic docs", description: "Claude API, prompting guides and tool use.", type: "Documentation", url: "https://docs.anthropic.com", tags: ["ai", "llm"] },
  { title: "Prompt engineering guide", description: "Techniques for clear, reliable prompts.", type: "Learning", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview", tags: ["ai", "prompts"] },
  { title: "Hugging Face", description: "Open models, datasets and demos.", type: "Website", url: "https://huggingface.co", tags: ["ai", "models"] },
  { title: "Cosine similarity", description: "Compare two embedding vectors.", type: "Snippet", content: "const cosine = (a, b) => {\n  let dot = 0, na = 0, nb = 0;\n  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }\n  return dot / (Math.sqrt(na) * Math.sqrt(nb));\n};", tags: ["ai", "embeddings", "javascript"] },
  // AWS
  { title: "AWS documentation", description: "Guides and API references for every service.", type: "Documentation", url: "https://docs.aws.amazon.com", tags: ["aws"] },
  { title: "AWS Well-Architected Framework", description: "Best practices for reliable, secure, cost-effective systems.", type: "Reference", url: "https://aws.amazon.com/architecture/well-architected/", tags: ["aws", "architecture"] },
  { title: "AWS Skill Builder", description: "Free courses and labs for AWS certifications.", type: "Learning", url: "https://skillbuilder.aws", tags: ["aws", "learning"] },
  { title: "AWS Pricing Calculator", description: "Estimate monthly costs before you build.", type: "Tool", url: "https://calculator.aws", tags: ["aws", "cost"] },
  { title: "List S3 bucket contents", description: "Recursive listing with sizes.", type: "Command", content: "aws s3 ls s3://my-bucket --recursive --human-readable --summarize", tags: ["aws", "s3", "cli"] },
  { title: "Tail Lambda logs", description: "Follow a function's CloudWatch logs live.", type: "Command", content: "aws logs tail /aws/lambda/my-function --follow --since 10m", tags: ["aws", "lambda", "cli"] },
  { title: "AWS Console", description: "Sign in to the management console.", type: "App", url: "https://console.aws.amazon.com", tags: ["aws"] },
  // Python
  { title: "Python docs", description: "Official language and standard library reference.", type: "Documentation", url: "https://docs.python.org/3/", tags: ["python"] },
  { title: "Real Python", description: "Practical tutorials from beginner to advanced.", type: "Learning", url: "https://realpython.com", tags: ["python", "learning"] },
  { title: "boto3 docs", description: "AWS SDK for Python.", type: "Reference", url: "https://boto3.amazonaws.com/v1/documentation/api/latest/index.html", tags: ["python", "aws"] },
  { title: "Create and activate a venv", description: "Isolated environment for a project.", type: "Command", content: "python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt", tags: ["python", "cli"] },
  { title: "Retry with backoff", description: "Retry a flaky call with exponential backoff.", type: "Snippet", content: "import time\n\ndef retry(fn, attempts=4, base=0.5):\n    for i in range(attempts):\n        try:\n            return fn()\n        except Exception:\n            if i == attempts - 1:\n                raise\n            time.sleep(base * 2 ** i)", tags: ["python"] },
  // JavaScript
  { title: "MDN JavaScript guide", description: "The best reference for the language.", type: "Documentation", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", tags: ["javascript"] },
  { title: "javascript.info", description: "The Modern JavaScript Tutorial.", type: "Learning", url: "https://javascript.info", tags: ["javascript", "learning"] },
  { title: "Node.js docs", description: "Runtime APIs: fs, http, streams.", type: "Reference", url: "https://nodejs.org/docs/latest/api/", tags: ["javascript", "node"] },
  { title: "Debounce helper", description: "Wait until typing stops before searching.", type: "Snippet", content: "export function debounce(fn, ms = 250) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n}", tags: ["javascript"] },
  { title: "TypeScript Playground", description: "Try TypeScript in the browser.", type: "Tool", url: "https://www.typescriptlang.org/play", tags: ["javascript", "typescript"] },
];

/** Starred so the Favourites page has something to show. */
const FAVORITE_RESOURCES = new Set(["Anthropic docs", "AWS documentation", "Tail Lambda logs", "Retry with backoff", "MDN JavaScript guide"]);

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) {
    console.error(`No account for ${email}. Register it first.`);
    process.exitCode = 1;
    return;
  }

  const removedNotes = await prisma.note.deleteMany({ where: { userId: user.id, title: { in: [...NOTES.map((note) => note.title), ...RETIRED_NOTE_TITLES] } } });
  const removedResources = await prisma.resource.deleteMany({ where: { userId: user.id, title: { in: [...RESOURCES.map((resource) => resource.title), ...RETIRED_RESOURCE_TITLES] } } });

  for (const note of NOTES) {
    await prisma.note.create({
      data: {
        userId: user.id,
        title: note.title,
        description: note.description,
        iconName: note.iconName,
        iconLibrary: note.iconLibrary,
        favorite: note.favorite ?? false,
        sections: {
          create: note.sections.map((section, sectionOrder) => ({
            title: section.title,
            order: sectionOrder,
            pages: { create: section.pages.map((page, pageOrder) => ({ title: page.title, order: pageOrder, content: toDoc(page.html) })) },
          })),
        },
      },
    });
  }

  await prisma.resource.createMany({
    data: RESOURCES.map((resource) => ({
      userId: user.id,
      title: resource.title,
      description: resource.description,
      type: resource.type,
      url: resource.url ?? null,
      content: resource.content ?? "",
      tags: resource.tags,
      favorite: FAVORITE_RESOURCES.has(resource.title),
    })),
  });

  const sections = NOTES.reduce((n, note) => n + note.sections.length, 0);
  const pages = NOTES.reduce((n, note) => n + note.sections.reduce((m, section) => m + section.pages.length, 0), 0);
  console.log(
    `Seeded ${NOTES.length} notes (${sections} sections, ${pages} pages) and ${RESOURCES.length} resources for ${user.email}` +
      (removedNotes.count || removedResources.count ? ` — replaced ${removedNotes.count} notes, ${removedResources.count} resources` : ""),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
