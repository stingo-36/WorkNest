---
name: worknest-codemap
description: File-level map of the WorkNest codebase — which route, action, lib, component, model and doc section own each feature. Use FIRST on any WorkNest task (bug, feature, question, redesign) to find the exact files instead of scanning or grepping the repo.
---

# WorkNest code map

> Every source file under `app/src` (except `generated/`) is listed here exactly once
> per feature. Open only the files for the feature you're touching, then the doc
> section in the last column if you need the *why*. `npm run docs:check` fails when a
> file is missing from this map or a listed path no longer exists — keep it green.
>
> Last synced with the codebase: **2026-10-26**

Paths are relative to `app/src/` unless they start with `app/` or `/`.
Docs: **PRD** = `PRD.md`, **Arch** = `Architecture.md`, **DS** = `Design-System.md`,
**Mem** = `Memory.md`, **Recipes** = `skills.md`.

## How to use this map

1. Find the feature row below → open those files only.
2. Need a rule or decision? Read the named doc section, not the whole doc
   (`grep -n "^## \|^### " <doc>` shows the sections).
3. Before re-deciding something, search `Memory.md` for the keyword
   (`grep -n -i "<keyword>" Memory.md`) — it records 700+ lines of past decisions.
4. Changed a file listed here, or added/removed one? Update this map
   (skill `worknest-docs-sync`).

## Cross-cutting core (touch with care)

| Concern | Files | Docs |
|---|---|---|
| Route protection | `proxy.ts`, `lib/auth.config.ts` (`PUBLIC_ROUTES`) | Arch §4 |
| Auth / sessions | `lib/auth.ts` (`checkCredentials`), `lib/session.ts` (`requireUser`, `requireUserId`), `lib/account-security.ts`, `app/api/auth/[...nextauth]/route.ts`, `actions/auth.ts` | Arch §4, §6 |
| Action plumbing | `lib/result.ts` (`ActionResult`, `parseOrFail`, `zodFields`), `lib/validation.ts` (**every** Zod schema), `lib/prisma.ts` | Arch §4, Recipes §2 |
| Sprint & dates | `lib/sprint.ts` (only sprint maths), UTC helpers in `lib/worklogs.ts` | Arch §6 |
| User settings & lists | `lib/user-settings.ts`, `lib/user-lists.ts`, `actions/user-lists.ts` | Arch §4 |
| AI (OpenRouter, Groq backup) | `lib/ai-summary.ts`, `lib/ai-settings.ts`, `lib/secret-box.ts` | Arch §4, PRD §5.1 |
| Shared rich text / uploads | `lib/rich-text.ts`, `components/ui/editor-uploads.ts`, `app/api/tracker-files/route.ts`, `app/api/tracker-files/[fileId]/route.ts` | Arch §3 |
| Tags / types | `lib/tag-colors.ts`, `lib/resource-types.ts`, `components/ui/tag-icon.tsx`, `components/ui/tag-chip.tsx`, `components/ui/tag-input.tsx` | DS §8 |
| Schema | `app/prisma/schema.prisma`, `app/prisma/migrations/` | Arch §5 |
| Root layouts | `app/layout.tsx` (fonts, local-dev ribbon), `app/(app)/layout.tsx` (auth + shell), `app/(auth)/layout.tsx`, `app/(marketing)/layout.tsx`, `app/not-found.tsx`, `components/providers.tsx` | Arch §3 |
| Tokens & global CSS | `app/globals.css` (tokens + `.wl-*` recipes, 1.9k lines — grep, don't read whole), `app/brand-art.css` | DS §2, §8 |

## Features

### Work Logs (core) — PRD §5.1 · Arch §3 · DS "Work Logs deck"
Models: `WorkLog`, `Meeting`, `WorkLogAttachment`, `TicketWorkUpdate`
- Routes: `app/(app)/work-logs/page.tsx` (sprint deck), `app/(app)/work-logs/[workLogId]/page.tsx` (detail), `app/(app)/work-logs/[workLogId]/edit/page.tsx`
- API: `app/api/work-logs/[workLogId]/attachments/route.ts`, `app/api/work-logs/[workLogId]/ai-refresh/route.ts`, `app/api/attachments/[attachmentId]/route.ts`
- Actions: `actions/worklog.ts`
- Lib: `lib/worklogs.ts`, `lib/worklog-summary.ts` (AI input), `lib/day-tracker.ts` (day's Tracker items)
- Deck: `components/work-log/sprint-deck.tsx`, `deck-search.tsx`, `create-day-tile.tsx`, `open-day-bar.tsx`, `day-stamp.tsx`, `day-todos.tsx`
- Editor: `components/work-log/work-log-editor.tsx`, `save-status.tsx` (autosave provider), `markdown-editor.tsx`, `meeting-section.tsx`, `learning-section.tsx`, `attachments-section.tsx`, `attachment-utils.ts`, `section-heading.tsx`, `day-type-toggle.tsx`, `day-type.ts`, `create-work-log-form.tsx`
- Tickets inside a log: `components/work-log/ticket-search.tsx`, `ticket-work-card.tsx`, `ticket-history.tsx`
- Detail/summary: `components/work-log/work-log-summary.tsx`, `work-log-glance.tsx`, `copy-log-button.tsx`, `types.ts` (client view models)

### Tickets — PRD §5.2 · Arch §6 (append-only history)
Models: `Ticket`, `TicketWorkUpdate`, `TicketHistoryEntry`
- Route: `app/(app)/tickets/page.tsx`, `app/(app)/tickets/loading.tsx`
- Actions: `actions/tickets.ts` · Lib: `lib/tickets.ts` (**critical**: upsert on `(ticketId, workLogId)`), `lib/workflow-status.ts`
- UI: `components/tickets/ticket-board.tsx`, `components/ui/ticket-status-badge.tsx`, `components/ui/project-input.tsx`

### Tracker (landing page) — PRD §5.3 · DS "Tracker queue"
Models: `FollowUp`, `FollowUpUpdate` (append-only), `FollowUpFile`
- Route: `app/(app)/tracker/page.tsx`
- Actions: `actions/follow-ups.ts` · Lib: `lib/follow-ups.ts`
- UI: `components/tracker/tracker-board.tsx` (1.9k lines — grep for the tab/dialog you need), `components/tracker/update-editor.tsx` (rich editor + renderer), `components/tracker/note-text.tsx` (legacy plain text)

### Notes — PRD §5.4 · DS "Notes F layout"
Models: `Note` → `NoteSection` → `NotePage` (TipTap JSON)
- Routes: `app/(app)/notes/page.tsx`, `app/(app)/notes/new/page.tsx`, `app/(app)/notes/[noteId]/page.tsx`, `app/(app)/notes/[noteId]/edit/page.tsx`
- Actions: `actions/notes.ts` (incl. `importNotebook` for Ask) · Lib: `lib/note-store.ts` (data), `lib/notes.ts` (shapes/schemas), `lib/note-import.ts` (markdown → notebook), `lib/note-icons.ts`, `lib/note-colors.ts`
- List: `components/notes/NoteLibrary.tsx` · Read: `NoteReader.tsx`, `NoteViewer.tsx`, `smooth-scroll.ts`, `doc-height.ts`
- Edit: `components/notes/NoteForm.tsx`, `SectionEditor.tsx`, `PageEditor.tsx`, `RichTextEditor.tsx`, `editor-extensions.ts`, `CodeBlock.tsx`, `NoteIcon.tsx`, `NoteIconPicker.tsx`, `note-field.tsx`

### Resources — PRD §5.5
Model: `Resource` (+ `UserList` for types)
- Route: `app/(app)/resources/page.tsx` · Actions: `actions/content.ts` · Lib: `lib/content.ts`
- UI: `components/resources/resource-library.tsx`, `components/resources/type-icon.tsx`

### Favourites — PRD §5.6
- Route: `app/(app)/favourites/page.tsx` (reads Prisma directly)

### Profile & settings — PRD §5.7
Models: `User`, `UserList`
- Route: `app/(app)/profile/page.tsx` · Actions: `actions/profile.ts`, `actions/user-lists.ts`
- UI: `components/profile/profile-form.tsx`, `list-editors.tsx`, `ai-settings.tsx`, `password-settings.tsx`, `components/ui/password-field.tsx`

### Achievements — PRD §5.8
Models: `Achievement`, `AchievementFile`
- Route: `app/(app)/achievements/page.tsx` · Actions: `actions/achievements.ts` · Lib: `lib/achievements.ts`
- API: `app/api/achievements/[achievementId]/files/route.ts`, `app/api/achievement-files/[fileId]/route.ts`
- UI: `components/achievements/achievements-board.tsx`

### Reports (5-15) — PRD §5.9
Model: `SprintReport`
- Route: `app/(app)/reports/page.tsx` · Actions: `actions/reports.ts` · Lib: `lib/reports.ts`
- UI: `components/reports/report-view.tsx`, `components/reports/report-format.ts`

### Quick log — PRD §5.10
- Actions: `actions/quick-log.ts` · Lib: `lib/quick-log.ts`
- UI: `components/quick-log/quick-log.tsx`, `components/quick-log/types.ts`

### Ask your workspace (AI agent) — PRD §5.13
- Actions: `actions/ask.ts` · Lib: `lib/ask.ts` (tools, context, proposals; pasted documents → `lib/note-import.ts`)
- UI: `components/ask/ask-widget.tsx`

### Kaizen phone API — PRD §5.14 · Arch §3
Bearer token, no cookie; `/api/mobile/*` is public in the proxy and checks its own token.
- Lib: `lib/mobile-api.ts` (token, CORS, list shapes)
- API: `app/api/mobile/connect/route.ts`, `app/api/mobile/tracker/route.ts`, `app/api/mobile/tracker/[followUpId]/route.ts`, `app/api/mobile/tracker/[followUpId]/updates/route.ts`, `app/api/mobile/resources/route.ts`, `app/api/mobile/resources/[resourceId]/route.ts`

### Admin — PRD §5.12 · Arch §6
- Route: `app/(app)/admin/page.tsx` · Actions: `actions/admin.ts` · Lib: `lib/admin.ts` (only cross-account code)
- UI: `components/admin/admin-dashboard.tsx`

### Installable app (PWA) — PRD §5.11
- `app/manifest.ts`, `app/public/sw.js`, `app/public/offline.html`, `components/pwa/pwa-provider.tsx`, `components/pwa/install-app.tsx`

### Auth screens — DS §3
- Routes: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/auth-motion.css`
- UI: `components/auth/auth-shell.tsx`, `login-form.tsx`, `register-form.tsx`, `auth-field.tsx`, `password-input.tsx`, `password-strength.tsx`, `safe-callback-url.ts`

### Homepage (marketing) — DS §4
- Route: `app/(marketing)/page.tsx`, `app/(marketing)/home.css`
- UI: `components/home/home-page.tsx`, `feature-showcase.tsx`, `doodles.tsx`, `recap-avatar.tsx`, `screen-motion.tsx`

### Shell & navigation — DS §8 "Shell" · Recipes §4
- `components/shell/app-shell.tsx`, `app-nav.tsx`, `nav-items.ts` (`PRIMARY_NAV`, `navFor`), `menu.tsx`, `page-head.tsx` (`PageHead`, current header), `page-header.tsx` (older `PageHeader`), `page-motion.tsx` (GSAP), `page-band.tsx` + `components/ui/band-sx.ts` (leftovers), `coming-soon-page.tsx`
- Coming soon / retired routes: `app/(app)/tasks/page.tsx`, `app/(app)/links/page.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/dashboard/page.tsx` (→ `/tracker`)

### UI primitives — DS §8 "Primitives" · Recipes §7
`components/ui/button.tsx`, `field.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `badge.tsx` (`Badge`, `TicketId`), `modal.tsx`, `confirmation-dialog.tsx`, `empty-state.tsx`, `toast.tsx`, `mui-provider.tsx`, `components/cn.ts`

## Scripts & tooling — Arch §8–9 · Recipes §9–11

- Root: `package.json`, `scripts/setup.mjs` (`npm run dev`), `scripts/check-docs.mjs` (`npm run docs:check`), `docker-compose.yml`
- App: `app/package.json`, `app/scripts/hosted-db.mjs`, `app/scripts/vercel-build.mjs`, `app/prisma.config.ts`, `app/next.config.ts`
- Seeds: `app/prisma/seed.ts`, `seed-sprint.ts`, `seed-tracker.ts`, `seed-workspace.ts`, `seed-notes.ts`, `seed-achievements.ts`, `seed-bulk.ts`, `seed-fill.ts`
- Agent setup: `AGENTS.md`, `CLAUDE.md`, `.claude/skills/worknest-*`, `.claude/agents/worknest-*`, `.claude/settings.json` (Stop hook → docs check)
