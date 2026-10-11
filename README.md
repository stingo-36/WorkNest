# WorkNest

A private, single-user workspace for a software professional's working day — daily
work logs, ticket history, follow-ups, notes and a resource library — recorded as it
happens, so months later it still answers *"what did I do, when, and in what order?"*

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, MUI 9, Auth.js, PostgreSQL 16
and Prisma 7. Optional AI summaries and sprint reports via OpenRouter.

---

## Quick start

**You need:** [Node.js 20.9+](https://nodejs.org) (24 LTS recommended),
[Docker Desktop](https://www.docker.com/products/docker-desktop) (running) and Git.
Nothing else — no global packages, no `npm install` at the root (the root has no
dependencies; the app's are installed for you).

```bash
git clone https://github.com/stingo-36/Personal-Workspace---WorkNest.git
cd Personal-Workspace---WorkNest
npm run dev
```

That's it. The first run sets everything up (about 30 seconds), then starts the app at
**http://localhost:3000**. The terminal prints a demo login:

- **Email:** `demo@worknest.local`
- **Password:** printed in the terminal, and saved as `SEED_PASSWORD` in `app/.env`

Or register your own account from the sign-in page.

> Prefer to set up without starting the server? Run `npm run setup`, then `npm run dev`
> whenever you want to work. Works the same on macOS, Linux and Windows.

### What the one command does

`npm run dev` runs `scripts/setup.mjs` before starting Next.js. Every step checks first
and skips what's already done, so it's safe — and quick — on every start:

1. Checks Node and that Docker is running.
2. Creates `app/.env` from `app/.env.example` with a freshly generated `AUTH_SECRET`
   and demo password (an existing `app/.env` is never touched).
3. Installs app dependencies (`npm ci`) and generates the Prisma client — only when
   they're missing or `package-lock.json` changed.
4. Starts PostgreSQL 16 in Docker (container `workspace-db`, host port **5434**).
5. Applies database migrations (`prisma migrate deploy`).
6. Seeds a demo account with sample work logs, tickets and resources — **only if the
   database has no users**, so it never overwrites your data.

### Without Docker (your own PostgreSQL)

Have PostgreSQL 16 running somewhere you can reach, then:

```bash
git clone https://github.com/stingo-36/Personal-Workspace---WorkNest.git
cd Personal-Workspace---WorkNest/app
cp .env.example .env          # then edit: DATABASE_URL, AUTH_SECRET, SEED_PASSWORD
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # a random AUTH_SECRET to paste in
npm ci                        # installs packages and generates the Prisma client
npx prisma migrate deploy     # creates the tables
npm run db:seed               # optional: demo account (replaces ALL users — empty DB only)
npm run dev                   # http://localhost:3000
```

---

## Features

| Area | What it does |
|---|---|
| **Work Logs** | One log per day: meeting notes, ticket work, learning notes, attachments. Grouped by sprint. Holiday/leave days. Copy a day as plain text. |
| **Tickets** | Find or create a ticket *inside* today's log. Work history is append-only — yesterday's update is never overwritten. Five-stage workflow. |
| **Tracker** | Follow-ups ("what did I tell whom, and when"), tasks, notes and ideas, grouped into Overdue / Today / Upcoming. |
| **Notes** | Notebooks → sections → pages with a rich-text editor. |
| **Resources** | Links, docs, tools, commands and snippets with searchable tags. |
| **Favourites** | Everything you've starred, in one place. |
| **Reports** | A "5-15" report per sprint, built from your work logs, ready to paste into a doc. |
| **Achievements** | Certifications, courses and awards on a timeline, with the certificate attached. |
| **AI summaries** | Optional: a short summary of any day and the sprint report, written by AI (your own OpenRouter key, free models work). No key → no AI; nothing is invented. |
| **Profile** | Your name, sprint calendar, tracked lists, whether you track tickets, and your AI key. |

Full product spec: [PRD.md](PRD.md).

---

## Everyday commands

Run from the repo root.

| Command | Does |
|---|---|
| `npm run dev` | Set up (if needed) and start the dev server on :3000 |
| `npm run setup` | Set up only |
| `npm run build` / `npm run start` | Production build / serve it |
| `npm run typecheck` · `npm run lint` | Type-check (generates Next's route types first) · lint |
| `npm run db:seed` | ⚠️ Re-seed the demo account (replaces **all** users) |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:migrate` | Create + apply a migration after editing `app/prisma/schema.prisma` |
| `npm run db:up` · `npm run db:down` | Start · stop the Postgres container (data is kept) |

More scripts (extra seeds, hosted DB) are listed in [Architecture.md](Architecture.md#8-scripts).

---

## Configuration

`app/.env` is created for you and is git-ignored. Template: [`app/.env.example`](app/.env.example).

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (local Docker DB by default) |
| `AUTH_SECRET` | Signs sessions — generated by setup. Changing it signs everyone out. |
| `AUTH_TRUST_HOST` | `true` |
| `SEED_EMAIL` · `SEED_PASSWORD` | The demo account the seed creates |
| `HOSTED_DATABASE_URL` | Only for deploying — see below |
| `OPENROUTER_API_KEY` | Optional server-wide AI key. Each user can also add their own in **Profile → Account**. |
| `OPENROUTER_MODEL` | Optional comma-separated model list (default: free models) |

Never commit `.env` files or real credentials; this repository is public.

---

## Project structure

```
├── app/                   Next.js application
│   ├── prisma/            schema, migrations, seed scripts
│   ├── public/home/       3D character art for the homepage and sign-in pages
│   └── src/
│       ├── app/           routes (App Router)
│       ├── actions/       server actions — the app's API
│       ├── lib/           server-only data layer
│       └── components/    UI
├── scripts/setup.mjs      one-command setup
├── docker-compose.yml     local Postgres
└── *.md                   project docs (below)
```

| Doc | Read it for |
|---|---|
| [PRD.md](PRD.md) | What the product does and why |
| [Architecture.md](Architecture.md) | How it's built: routes, data model, rules |
| [Design-System.md](Design-System.md) | Colours, type, spacing, components |
| [AGENTS.md](AGENTS.md) | How to work on the code (humans and AI agents) |
| [Memory.md](Memory.md) | Decisions made and why, known gotchas |
| [skills.md](skills.md) | Step-by-step recipes for common changes |

---

## Deploying

Vercel (project root directory `app`) with a hosted Postgres such as Neon. Set
`DATABASE_URL` (pooled), `AUTH_SECRET` and `AUTH_TRUST_HOST=true` in Vercel, then apply
migrations from your machine with `npm --prefix app run db:hosted`. Full checklist:
[skills.md → Deploy](skills.md#11-deploy-vercel--neon).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Docker is installed but not running" | Start Docker Desktop, wait until it's ready, re-run. |
| Port **5434** already in use | Stop whatever uses it, or change the port in `docker-compose.yml` **and** `DATABASE_URL`. |
| Port **3000** already in use | Stop the other app, or run `npm --prefix app run dev -- -p 3001`. |
| Page loads but buttons do nothing | Open **http://localhost:3000**, not `127.0.0.1` — the dev server blocks other origins. |
| Signed out unexpectedly | `AUTH_SECRET` changed; just sign in again. |
| "Cannot find module … generated/prisma" | `npm --prefix app exec prisma generate` (setup normally does this). |
| Old styles or pages after pulling | Stop the server, delete `app/.next`, run `npm run dev` again. |
| Start over with an empty database | ⚠️ Deletes all local data: `docker compose down -v`, then `npm run dev` (it re-creates the DB and seeds the demo account). |
