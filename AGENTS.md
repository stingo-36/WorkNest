# AGENTS.md — how to work on WorkNest

Instructions for any coding agent (Claude Code, Codex, …) working in this repo.
`CLAUDE.md` imports this file.

## 1. Read first (every session)

| File | Answers |
|---|---|
| `PRD.md` | What we're building; which features are live, hidden, coming soon or retired |
| `Architecture.md` | How it's built: stack, routes, layering, data model, invariants, scripts |
| `Design-System.md` | How it looks: palettes, tokens, type, components, rules |
| `Memory.md` | Decisions already made (and why), gotchas, recent changes |
| `skills.md` | Step-by-step recipes for recurring tasks in this codebase |

Use `Architecture.md` instead of re-scanning the repo. If it turns out to be wrong,
fix it as part of your task.

## 2. Keeping the docs current (required)

These six files are the project's memory. **Any change that alters what they say must
update them in the same piece of work**, before you report the task as done.

| If you… | Update |
|---|---|
| Add, remove, hide, retire or materially change a user-facing feature or route | `PRD.md` §4 inventory + the feature's §5 section; `Architecture.md` §3 routes |
| Add/move/delete a module, action, lib file, route handler or script | `Architecture.md` (§2 layout, §4 modules, §8 scripts) |
| Change the Prisma schema or add a migration | `Architecture.md` §5 (and §6 if an invariant changes); `PRD.md` if behaviour changes |
| Change tokens, fonts, breakpoints, component APIs or visual rules | `Design-System.md` (tables must match the CSS) |
| Make a choice someone could later second-guess, reverse an earlier decision, or discover a gotcha | `Memory.md` → Decisions (newest first) / Gotchas |
| Finish any task | `Memory.md` → Changelog: one line, `YYYY-MM-DD — what changed — key files` |
| Establish a new repeatable procedure, or change an existing one | `skills.md` |
| Change how agents should work | `AGENTS.md` |

Also bump the **"Last synced"** date at the top of each file you touch. Keep edits
surgical — update the affected rows/sections, don't rewrite whole files. Use absolute
dates (e.g. 2026-09-29), never "yesterday".

## 3. Commands

Run from the repo root unless noted.

```bash
npm run dev          # idempotent setup (env, deps, Docker Postgres :5434, migrations) + Next dev on :3000
npm run setup        # the same setup without starting the server
npm run typecheck    # next typegen + tsc --noEmit for app/ (works on a fresh clone)
npm run lint         # eslint for app/
npm run build        # next build --webpack
npm run db:migrate   # prisma migrate dev (creates + applies a migration)
npm run db:studio    # browse the DB
```

App-only scripts: `npm --prefix app run <script>` — see `Architecture.md` §8.

## 4. House rules

**Product**
- **Regular-user isolation is absolute.** Every normal query and mutation is scoped
  by the session `userId` (from `requireUser()`/`requireUserId()`), never an id sent
  by the client. The only cross-account reads/mutations live in `lib/admin.ts`, call
  `requireAdmin()` first, and expose only the documented admin account-management
  surface. Destructive admin mutations require the target account email.
- **History is append-only.** Never add an edit/delete path for `TicketWorkUpdate`
  (except the existing same-log autosave upsert and detach) or `FollowUpUpdate`.
  Whole-account/whole-workspace erasure is the explicit privacy/admin exception.
- **Only what exists.** Don't present Coming Soon or deferred features as live
  (homepage, nav, empty states). No invented users, logos or numbers.
- Single-user product: no team/sharing language.

**Code**
- Keep the layering: client component → `actions/*` (auth → Zod → `lib/*` →
  `revalidatePath` → `ActionResult`) → `lib/*` (`server-only`, explicit `userId`).
- Validate every mutation server-side with a schema in `lib/validation.ts`.
- Sprint maths only via `lib/sprint.ts`; work-log dates via the helpers in
  `lib/worklogs.ts`.
- Next.js 16 differs from older versions (`proxy.ts` not `middleware.ts`, async
  `params`, etc.). Check `app/node_modules/next/dist/docs/` before using an API
  you're unsure of.
- Match the surrounding code: naming, comment density (comments explain *why*),
  file structure. Small, focused changes; don't refactor what nobody asked about.
- Working code fast, readable, not over-engineered.

**UI**
- Design tokens only — no raw hex, px font sizes or ad-hoc shadows (see
  `Design-System.md` §10). Reuse `components/ui/*` primitives.
- Light only. Responsive at 375 / 768 / 1024 / 1440 with no horizontal page scroll;
  the nav stays on one line; no `sm:` classes (that breakpoint doesn't exist).
- For visual work, follow `Design-System.md` first; the project design skills in
  `.claude/skills/` (see `skills.md` §13) are the deeper reference.
- Visible labels, keyboard access, visible focus, reduced-motion support.

## 5. Verifying work

There is no automated test suite by design. Verify the real thing:

1. `npm run typecheck` and `npm run lint` pass.
2. For schema changes: migration created with `db:migrate`, client regenerated.
3. For UI changes: run the app (`npm run dev`, or the `run` skill / browser preview)
   and check the affected screens at 360, 768, 1024 and 1440 — including empty,
   loading and error states.
4. For data-rule changes: exercise the flow and confirm in `db:studio` (e.g. a second
   day's ticket update creates a new row; autosave doesn't duplicate).

Report honestly: if something wasn't verified, say so.

## 6. Safety

- **Ask before running** anything destructive: `db:reset`, `db:hosted -- --seed`
  (wipes all users on the hosted DB), `db:seed:sprint` / `db:seed:tracker` /
  `db:seed` (replace an account's data), or any deploy.
- Never commit `.env`, `.env.vercel` or real credentials — the GitHub repo is public.
  Seed passwords come from `SEED_PASSWORD`.
- Never edit `app/src/generated/prisma/` by hand; never rewrite an applied migration —
  add a new one.
- Commit or push only when asked. Work on a branch, not `main`.
