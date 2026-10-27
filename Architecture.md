# Architecture — WorkNest

> **How it's built.** Read this instead of re-scanning the repo. If you add, move or
> delete a module, route, model or script, update the relevant section in the same
> change.
>
> Last synced with the codebase: **2026-10-27**

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3** (App Router, `src/` dir, alias `@/*`) | Breaking changes vs. older Next — read `app/node_modules/next/dist/docs/` before using an unfamiliar API. `middleware.ts` is now **`proxy.ts`**. Production build uses `next build --webpack`. |
| UI | **React 19.2**, TypeScript 5, GSAP | Server Components by default; `"use client"` only where needed. GSAP owns route-specific load choreography; CSS owns small state transitions and Work Logs' dedicated calendar sequence. |
| Styling | **Tailwind CSS 4** (CSS-first, no `tailwind.config`) | All tokens in `src/app/globals.css` via `@theme inline`. |
| Form fields | **MUI 9** (`@mui/material`, `@mui/material-nextjs`) + Emotion | In `@layer mui` so Tailwind wins. |
| Rich text | **TipTap 3** (+ lowlight) | Notes pages (JSON) and work-log Markdown fields. |
| Motion | `motion` / `framer-motion` (app); plain CSS + IntersectionObserver on the homepage | |
| Icons | `lucide-react` (app), `react-icons` (note icons) | |
| Data | **PostgreSQL 16** + **Prisma 7.10** with `@prisma/adapter-pg` | Client generated to `src/generated/prisma` (gitignored). URL lives in `prisma.config.ts`, not the schema. |
| Auth | **Auth.js / NextAuth v5 beta** — Credentials provider, **JWT** sessions (30 days), `@auth/prisma-adapter`, `bcryptjs` (cost 12) | |
| Validation | **Zod 4** | Every mutation. |
| Toasts | `sonner` (wrapped in `components/ui/toast.tsx`) | |
| Dates | `date-fns` 4 | |
| Runtime | Node 24 | |

## 2. Repository layout

```
/                              repo root (git)
├── AGENTS.md  CLAUDE.md       agent instructions (CLAUDE.md imports AGENTS.md)
├── PRD.md  Design-System.md  Architecture.md  Memory.md  skills.md
├── .claude/skills/            worknest-* agent skills (codemap, ui, backend, docs-sync) + design skills (design-taste-frontend, redesign-existing-projects, ui-ux-pro-max, responsive-design)
├── .claude/agents/            worknest-* subagents (explorer, designer, backend, memory-keeper, reviewer)
├── .claude/settings.json      Stop hook → scripts/check-docs.mjs --hook
├── README.md                  clone → `npm run dev` quick start
├── scripts/setup.mjs          one-command, idempotent local setup (zero deps)
├── scripts/check-docs.mjs     `npm run docs:check`: code map ↔ codebase drift check (also the Stop hook)
├── package.json               root convenience scripts → delegate to app/
├── docker-compose.yml         Postgres 16, container workspace-db, host port 5434
└── app/                       the Next.js application
    ├── next.config.ts         LAN dev origin 192.168.31.130 (dev assets + server actions)
    ├── prisma.config.ts       schema path, migrations dir, seed command, DATABASE_URL
    ├── components.json        shadcn config (utils alias → @/components/cn)
    ├── prisma/
    │   ├── schema.prisma      the data model (§5)
    │   ├── migrations/        28 migrations, init 2026-09-11 → tracker_personal_todos 2026-10-21
    │   └── seed*.ts           seed scripts (§8)
    ├── scripts/
    │   ├── hosted-db.mjs      migrate (+ optional seed) the hosted DB
    │   └── vercel-build.mjs   Vercel's build: Production migrates, then `next build`
    ├── public/
    │   ├── home/              3D character art: hero-1…4.webp, recap-avatar.webp, auth art
    │   ├── icons/             install icons: 192, 512 and Android maskable 512
    │   ├── sw.js              network-only service worker + offline fallback
    │   └── offline.html       standalone offline screen (no private data)
    └── src/
        ├── proxy.ts           route protection (§4)
        ├── app/               routes (§3)
        ├── actions/           "use server" — the client's entire API surface
        ├── lib/               server-only data + domain layer
        ├── components/        UI (see Design-System.md §8)
        └── generated/prisma/  generated client (never edit)
```

## 3. Routes

Route groups: `(marketing)` public homepage, `(auth)` login/register, `(app)`
authenticated shell.

| Path | File | Kind |
|---|---|---|
| `/` | `(marketing)/page.tsx` → `HomePage` (`components/home/*`: `home-page`, `feature-showcase`, `doodles`, `recap-avatar` (user's 3D character cut-out `public/home/recap-avatar.webp`; hidden while missing); `screen-motion` (replays each snapped screen's `[data-anim]` entrance on every arrival, direction-aware); styles `(marketing)/home.css` + `app/brand-art.css`) | public |
| `/login`, `/register` | `(auth)/*/page.tsx` | public; direct sign-in redirects by persisted role (`Admin` → `/admin`, `User` → `/tracker`); an explicit safe callback still wins |
| `/work-logs` | `(app)/work-logs/page.tsx` | sprint deck (`components/work-log/sprint-deck.tsx`; `?day=` picks the day and its sprint, ‹ › step between past sprints; logs loaded for that sprint's range only); Tracker entries per day via `listTrackerForRange` (actions/lib `follow-ups.ts`) |
| `/work-logs/[workLogId]` | `.../page.tsx` | read-only detail + Copy as text; side rail begins with that day's Tracker to-dos |
| `/work-logs/[workLogId]/edit` | `.../edit/page.tsx` | `WorkLogEditor` |
| `/tickets` | `(app)/tickets/page.tsx` | `TicketBoard` (`PageHead`, direct New ticket form, underline status tabs, list + open ticket with editable number/title/project, compact journey and latest update); redirects to `/work-logs` if tickets disabled; `?ticket=<id>` selects that ticket (status filter → All) |
| `/tracker` | `(app)/tracker/page.tsx` | `TrackerBoard` — two-column queue per tab (To-do: Today | Upcoming; Follow-ups: Needs you | Waiting; Notes: composer | notes), latest update inline, finished entries in a collapsed group; entries open in a two-column dialog; rich editor + read-only renderer in `components/tracker/update-editor.tsx` (Notes TipTap schema + upload-only images), legacy plain-text rendering in `note-text.tsx`; default landing after login; `?view=todo\|followups\|notes` picks the tab; `?open=<id>` opens that entry (Ask's source links; dropped from the URL once opened) |
| `/notes`, `/notes/new`, `/notes/[noteId]`, `/notes/[noteId]/edit` | `(app)/notes/**` | notebooks; the list is `NoteLibrary` (layout "F": header, summary column, bookshelf) |
| `/resources` | `(app)/resources/page.tsx` | `ResourceLibrary` |
| `/favourites` | `(app)/favourites/page.tsx` | reads Prisma directly; `?show=important\|notes\|resources` picks the tab |
| `/profile` | `(app)/profile/page.tsx` | `ProfileForm` |
| `/achievements` | `(app)/achievements/page.tsx` | `AchievementsBoard` (account menu) |
| `/reports` | `(app)/reports/page.tsx` | `ReportView` (account menu); `?sprint=YYYY-MM-DD` |
| `/admin` | `(app)/admin/page.tsx` → `components/admin/admin-dashboard.tsx` | Admin-only operations console: totals, searchable account master/detail, password reset, record erasure and account deletion; every action server-guarded by `requireAdmin()` |
| `/dashboard` | `(app)/dashboard/page.tsx` | `redirect("/tracker")` (retired) |
| `/manifest.webmanifest` | `app/manifest.ts` | public install metadata; starts at `/tracker` |
| `/sw.js`, `/offline.html`, `/icons/*` | `public/*` | public PWA runtime and branded install assets |
| any unknown URL | `app/not-found.tsx` | branded 404 → Tracker / homepage |
| `/tasks`, `/links`, `/settings` | `(app)/*/page.tsx` | `ComingSoonPage` |
| `GET/POST /api/auth/[...nextauth]` | route handler | NextAuth |
| `POST /api/work-logs/[workLogId]/attachments` | route handler | multipart upload (field `files`) |
| `POST /api/tracker-files` | route handler | editor uploads for every rich field — Tracker updates, Work Log / Ticket Markdown fields, Resource and Achievement descriptions (field `files`, ≤5 × 4 MB) → `{ files: [{ id, name, mimeType, size, url }] }` |
| `GET /api/tracker-files/[fileId]` | route handler | owner-only download; images/PDF/text inline, everything else as attachment, `nosniff` |
| `POST /api/work-logs/[workLogId]/ai-refresh` | route handler | leave-the-editor beacon: 202 now, then `after()` regenerates the AI summary/title if the content changed |
| `GET /api/attachments/[attachmentId]` | route handler | owner-only download |
| `POST /api/achievements/[achievementId]/files` | route handler | certificate upload (field `files`) |
| `GET /api/achievement-files/[fileId]` | route handler | owner-only certificate download |
| `POST /api/mobile/connect` | route handler | Kaizen phone link: `{ email, password }` → `{ token, email, name }` (Tracker-only bearer token, no cookie) |
| `GET/POST /api/mobile/tracker` | route handler | bearer token → `{ entries, options }` (open + done in the last 48 h; `options` = channels, people, saved note tags); POST takes `createFollowUpSchema` (+ optional `pinned`) and answers with the fresh list |
| `GET/PATCH /api/mobile/tracker/[followUpId]` | route handler | bearer token; GET → one entry with its history; PATCH takes exactly one of `{ status }` (tick/reopen), `{ subject }` (personal sticky only), `{ pinned }`, `{ dueDate }` (`mobileTrackerPatchSchema`) |
| `POST /api/mobile/tracker/[followUpId]/updates` | route handler | bearer token; `addFollowUpUpdateSchema` — append to the entry's history |
| `GET/POST /api/mobile/resources` | route handler | bearer token; GET → library (newest first) + the user's resource types; POST saves with `createResourceSchema` |
| `PATCH /api/mobile/resources/[resourceId]` | route handler | bearer token; star/unstar (`toggleResourceFavoriteSchema`) |

`(app)/layout.tsx` runs `requireUser()` + `getUserSettings()` once, wraps children in
`MuiProvider` + `AppShell`, and passes `ticketsEnabled` and `isAdmin` to the nav. `AppShell` mounts
`QuickLogProvider` (the Quick log dialog) inside `.app-shell`. Its content well is
wrapped by `shell/page-motion.tsx`, which assigns a GSAP motion family by route and
replays major regions when the pathname changes (see Design-System §7). Its sticky,
full-width top bar has five labelled destinations on phones (Favourites moves to the
account menu) and six on larger screens; the account menu opens below the bar.

The root `Providers` mounts `PwaProvider`, which registers `/sw.js`, captures the
Chromium install prompt, and exposes install state. `pwa/install-app.tsx` adds the
account-menu action and the iOS/other-browser instruction dialog. The dialog is
mounted by `AppShell` so it inherits the workspace tokens.

`app/layout.tsx` also renders a full-viewport local tint, frame and **Local development**
ribbon when `WORKNEST_LOCAL=1`. Its `WORKNEST_LOCAL_TINT` and
`WORKNEST_LOCAL_ACCENT` colour values live only in Git-ignored `app/.env.local`;
Vercel has none of these values and therefore renders no marker. Do not add these
variables to Vercel environments.

## 4. Request lifecycle & layering

```
browser ──► proxy.ts ──► (app)/layout.tsx ──► page.tsx (Server Component)
            JWT check      requireUser()          reads via actions/* or lib/*
            (no DB)        getUserSettings()      │
                                                  ▼
            client component ──call──► actions/*.ts ("use server")
                                        1. requireUserId()         ← identity from session only
                                        2. parseOrFail(zodSchema)  ← lib/validation.ts
                                        3. lib/*.ts fn(userId, …)  ← every WHERE has userId
                                        4. revalidatePath(...)
                                        5. return ActionResult<T>  ← lib/result.ts
```

- **`proxy.ts`** uses the Prisma-free `lib/auth.config.ts` (`authorized` callback,
  `PUBLIC_ROUTES = ["/", "/login", "/register"]` + `/api/auth/*` + `/api/mobile/*`, whose
  handlers check their own bearer token). It also
  **clears undecryptable session cookies** (e.g. after an `AUTH_SECRET` change) so a
  stale cookie can't loop forever. Its matcher skips static files by extension (svg/png/jpg/…/woff2) — add any
  new public asset type there or it gets redirected to `/login`. The manifest,
  service worker and offline page are also explicitly public so installation works
  before sign-in.
- **`lib/auth.ts`** adds the Node-only pieces: Credentials provider, PrismaAdapter,
  bcrypt. `checkCredentials` (shared by sign-in and the phone link) compares unknown
  emails against a dummy hash (no enumeration).
- **`lib/session.ts`**: `getCurrentUser` (request-memoised; treats a bad cookie as
  signed out), `requireUser`, `requireUserId`. **Every action and query starts here.**
- **`lib/result.ts`**: `ActionResult<T> = {ok:true,data} | {ok:false,error:{code,message,fields?}}`;
  codes `VALIDATION_ERROR | UNAUTHORIZED | NOT_FOUND | CONFLICT | INTERNAL_ERROR`.
- **`lib/*`** files import `"server-only"`. `components/**` must not import them in
  client components — client-safe constants live in components (e.g.
  `components/work-log/day-type.ts` mirrors the server defaults).
- `cn()` lives at `@/components/cn`, not in `lib/`.

### Server modules

| File | Owns |
|---|---|
| `lib/worklogs.ts` | work logs, meetings (3 defaults), learning notes, attachments, days off, UTC-date helpers, `touchWorkLog`, `saveWorkLogSummaryRow` (modes manual/auto/background; skips unchanged content via `aiInputHash`; retitles only default/AI titles) |
| `lib/worklog-summary.ts` | AI input for one log: `workLogHasContent`, `workLogAsText` (tickets, Work done, the day's Tracker to-dos / follow-ups / notes; **no meetings**). No code-built summary |
| `lib/day-tracker.ts` | `trackerOnDay` — sorts `listTrackerForRange` entries into one day (to-dos done/due/overdue/created, follow-ups, notes); shared by the Work Logs day card and the AI input |
| `lib/ai-summary.ts` | `openRouterComplete` → `AiResult` (text/model, or an `AiFailure`: not_configured/auth/credits/rate_limited/unavailable/cut_off/bad_reply, with the model when one answered); optional `accept` to tidy/reject; `checkReasoning: false` for JSON replies (skips the reasoning-leak regex, `accept` validates instead); one automatic retry on cut_off/bad_reply; `aiFailureMessage`; `summarizeWithOpenRouter`, `titleWithOpenRouter`; `openRouterChat` (messages + tools, `require_parameters`, reads tool calls incl. ones written as text by some free models, `noTools` when no model can call tools). Both go to **Groq** (`withGroqBackup`, same request) when OpenRouter fails or has no key — its models in turn while each is rate-limited (8k tokens/min per model on the free tier), then one wait-and-retry if the `retry-after` is ≤ 15 s; once OpenRouter is down (`auth`/`credits`/`rate_limited`/`unavailable`) the config's `skipOpenRouter` keeps the rest of that request on Groq. **AI only — no non-AI fallback** |
| `lib/tickets.ts` | **the critical piece** — ticket lookup/upsert, `addTicketWorkUpdate` (upsert on `(ticketId, workLogId)`), detach, standalone history, project names, `findTicketsByKeyHint` (Quick log: exact key or bare number → `*-1233`) |
| `lib/ask.ts` | Ask your workspace — a tool-using agent. Starts with CONTEXT (keyword matches via `searchTerms`/`findCandidates`/`rank`, every open Tracker entry via `openTracker` with exact counts and due wording, the work-log date span), then up to 4 tool rounds via `openRouterChat`: `search_workspace`, `get_work_logs` (≤ 62 days), `list_tracker` (open/done, done-in-range), `create_tracker_item`, `change_tracker_item` (done/reopen/reschedule/add_update by record number → id mapped server-side by `Records`). Last round goes without tools (`flatten`). Proposals are returned, never applied. Uses `ASK_MODELS` (tool-capable free models) while the user is on the default model list; falls back to one plain completion with an `<items>` block (`askWithoutTools`/`parseItems`) when no model supports tools. Cites `[n]`; if none, lists what the tools looked up. A pasted markdown document skips the AI (`notebookReply`) and returns a `notebook` plan from `lib/note-import.ts` |
| `lib/quick-log.ts` | Quick log: `draftQuickLog` (AI → JSON read leniently with Zod, then matched to the user's tickets / meeting cards / people / channels; to-dos fall back to one per line without AI) `workLogTemplate` (headings: the day's meetings, open tickets, Work done), and `applyQuickLog` (writes via `worklogs`/`tickets`/`follow-ups` lib functions; same-day re-apply appends) |
| `lib/workflow-status.ts` | 5-stage workflow + legacy status normalisation |
| `lib/follow-ups.ts` | Tracker entries + append-only updates, pin, status, reschedule, tags, `editPersonalTodo` (rewrites a personal to-do's text only), `listTodosAroundDay` (work-log to-dos card) |
| `lib/note-store.ts`, `lib/notes.ts`, `lib/note-icons.ts`, `lib/note-colors.ts` | notebooks, trash/restore, icon search, accent colours |
| `lib/note-import.ts` | markdown → notebook (`marked` lexer → TipTap JSON): `parseNotebookMarkdown` (`#` notebook with one section of the same name, `##` page, `###`+ headings inside the page), `planNotebookImport` (create vs update counts — new/changed/removed pages, `reshaped` — for Ask's card), `importNotebook` (create, or reshape the live notebook with the same title to match the paste: pages matched by title anywhere, ignoring case and a leading number; pages and sections not in the paste are deleted by `updateNote`). Saved via `importNotebook` in `actions/notes.ts` |
| `components/notes/smooth-scroll.ts`, `components/notes/doc-height.ts` | client: frame-by-frame smooth jump that follows a moving target and pauses lazy page mounting while in flight (`isJumping`, `NOTE_SCROLL_END`); estimated height for an unmounted page body. Used by the reader and the editor |
| `lib/content.ts` | tasks, links, resources (+ favourite) |
| `components/shell/page-head.tsx` | the shared page header (`PageHead`), `SearchPill`, `UnderlineTabs`, `primaryPill` / `outlinePill` — every list page except Work Logs |
| `components/shell/page-motion.tsx` | GSAP route-family choreography for authenticated page regions; reduced-motion safe, load-only and intentionally unrelated to scrolling |
| `components/shell/page-band.tsx`, `components/ui/band-sx.ts` | leftovers: `bandField` (Quick log's band button) and the MUI `tone="band"` field styling |
| `lib/sprint.ts` | **the only** sprint arithmetic (`getSprint`) — local calendar days |
| `lib/rich-text.ts` | shared (client + server): `docToText` (TipTap JSON → plain text with "- " lists), `docFileIds`, `markdownPreview` (Markdown → one plain line), `TRACKER_FILE_PATH`, `MAX_TRACKER_FILE_BYTES` |
| `components/ui/editor-uploads.ts` | client: `TrackerImage` (TipTap image node, upload-only sources), `uploadFiles`, `insertUploads` — shared by `tracker/update-editor.tsx` and `work-log/markdown-editor.tsx` |
| `lib/tag-colors.ts` | shared: `tagColor(tag)` — brand colour for known tech tags, else a stable hue (no network call) |
| `lib/resource-types.ts` | shared (client + server): built-in type labels/plurals (`typeMeta`) and `resourceTypeKey` — types with the same on-screen name are one type |
| `lib/user-lists.ts` | Profile-editable lists: `DEFAULT_LISTS`, ordered lists, project options/suggestions, tag usage + rename/delete (raw SQL, user-scoped) |
| `lib/reports.ts` | sprint list, report data per sprint, AI-only "5-15 Report" (`generateSprintReport` → ok or failure reason; `normalizeReportBody` tolerates bold/other-level section headings and `*`/`•` bullets), staleness; model-less (old code-built) reports ignored |
| `lib/achievements.ts` | achievements + certificate files (bytes only read by the download route) |
| `lib/user-settings.ts` | profile settings (name, sprint config, `ticketsEnabled`), request-memoised |
| `lib/admin.ts` | persisted-role admin guard, cross-account statistics, password reset, whole-workspace erasure and account deletion; destructive calls verify the target email |
| `lib/account-security.ts` | self-service password change: verifies the current bcrypt hash, writes a new cost-12 hash and increments `authVersion` |
| `lib/ai-settings.ts` | per-user OpenRouter key/model: `getAiSettings` (client-safe view, never the key; `groqBackup`), `getOpenRouterConfig` (user key → env fallback, plus the env Groq backup; null only when neither exists), `checkOpenRouterKey`, save/clear |
| `lib/secret-box.ts` | AES-256-GCM `seal`/`open` for stored secrets, keyed off `AUTH_SECRET` |
| `lib/mobile-api.ts` | Kaizen phone link: stateless HMAC token (`wn1.<userId>.<authVersion>.<sig>`, keyed off `AUTH_SECRET`) `createMobileToken` / `verifyMobileToken`, CORS `mobileJson` / `preflight`, `listMobileTracker` (the phone's list shape) |
| `lib/validation.ts` | all Zod schemas |
| `lib/prisma.ts` | Prisma client singleton with the pg adapter |

| Actions file | Exposes |
|---|---|
| `actions/auth.ts` | `register`, role-aware `login` (`Admin` → `/admin`, `User` → `/tracker`; safe callback may override), `logout` (→ `/login`) |
| `actions/admin.ts` | Admin-only password reset, whole-workspace record erasure and account deletion; Zod → `lib/admin.ts` → `/admin` revalidation |
| `actions/worklog.ts` | open today/by date, get, adjacent, list, update, delete, meetings CRUD, learning notes, link attachments, delete attachment |
| `actions/tickets.ts` | create standalone, find, upsert-for-work-log, save work update, detach, get, list, projects, active, update, append/delete history entry, delete ticket |
| `actions/follow-ups.ts` | create, add update, pin, status, reschedule, `setFollowUpTags`, `editPersonalTodo`, `listTodosForDay`, delete, list, people |
| `actions/notes.ts` | create, update, delete (trash), restore, toggle favourite |
| `actions/content.ts` | tasks, links, resources CRUD + `toggleResourceFavorite` |
| `actions/profile.ts` | `updateProfile`, self-service `changePassword`, `saveAiKey`, `removeAiKey`, `saveAiModel` |
| `actions/user-lists.ts` | Profile lists: set/reset ordered list, resource-type icon, add/remove project, add/rename/delete/delete-all tags |
| `actions/reports.ts` | `generateReport` |
| `actions/ask.ts` | `askWorkspace` ({ question, history, today } → { answer, sources, proposals }; no writes — the chat applies a confirmed proposal via `createFollowUp` / `setFollowUpStatus` / `rescheduleFollowUp` / `addFollowUpUpdate`; AI failure → `AI_UNAVAILABLE`) |
| `actions/quick-log.ts` | `getWorkLogTemplate`, `draftQuickLog` (no writes; AI failure → `AI_UNAVAILABLE`), `applyQuickLog` (re-validated draft; revalidates work logs, tickets, tracker) |
| `components/reports/report-format.ts` | client-safe: parse report Markdown → title/sections/groups; `reportToHtml` (doc-styled clipboard HTML), `reportToText` |
| `actions/achievements.ts` | create, update, delete achievement; delete achievement file |

Client-safe shared modules outside `lib/`: `components/work-log/day-type.ts`,
`components/quick-log/types.ts` (Quick log draft shapes), `components/cn.ts`.

## 5. Data model (`app/prisma/schema.prisma`)

Every domain table has `userId` → `User` with `onDelete: Cascade`, and indexes led by
`userId`.

```
User ─┬─ WorkLog ─┬─ Meeting
      │           ├─ WorkLogAttachment (File bytes | Link)
      │           └─ TicketWorkUpdate ─┐
      ├─ Ticket ──┬────────────────────┘   @@unique([ticketId, workLogId])
      │           ├─ TicketHistoryEntry     (standalone, deletable)
      │           └─ Task (optional FK)
      ├─ FollowUp ── FollowUpUpdate          (Tracker; append-only)
      │      └─ FollowUpFile                 (editor uploads; followUpId null until saved)
      ├─ Note ── NoteSection ── NotePage     (TipTap JSON)
      ├─ Achievement ── AchievementFile      (certificate bytes)
      ├─ Resource   ├─ Link   ├─ Task
      └─ Account / Session (Auth.js)         VerificationToken
```

| Model | Key fields & invariants |
|---|---|
| `User` | `email` unique, `passwordHash`, `role` (`User` default / `Admin`), `authVersion` (incremented on password change/reset to revoke old JWTs), profile: `sprintStartDate` (`@db.Date`, null = default), `sprintLengthDays` (14), `ticketsEnabled` (true), `openRouterKeyEnc` (sealed, never sent to client) + `openRouterKeyHint` + `openRouterModel` |
| `WorkLog` | `date` `@db.Date` stored as UTC midnight, **`@@unique([userId, date])`**; `title`, `dayType` (Work/Holiday/Leave), `learningNotes` (Markdown), `summary` (generated Markdown, nullable) + `summaryGeneratedAt` + `summaryModel` (null = built from entries); `aiInputHash` (SHA-256 of the text the AI last read) and `titleGenerated` (title written by the AI; a user edit sets it false) |
| `Meeting` | `name`, `notes` (Markdown), `order`, `isDefault` |
| `WorkLogAttachment` | `kind` File/Link, `name`, `url?`, `mimeType?`, `size?`, `data Bytes?` (≤10 MB). **`data` is never selected in lists** — only the download route reads it. |
| `Ticket` | `ticketId` = human key, **`@@unique([userId, ticketId])`**; `title`, `projectName?`, `status` |
| `TicketWorkUpdate` | one per (ticket, work log): `description`, `status` snapshot. **Append-only history.** |
| `TicketHistoryEntry` | `body`, `status` snapshot; written from `/tickets`; may be deleted |
| `FollowUp` | `kind` (FollowUp/Task/Note — `Idea` folded into Note 2026-10-01), `tags String[]` (notes), `person?` (FollowUp only), `subject`, `ticketKey?` (free text, not FK), `status` Open/Done, `pinned`, `personal` (Task only — To-do → Personal sticky notes; their `subject` may hold line breaks, ≤1000 chars, others are one line ≤300; excluded from `listTrackerForRange`, `listTodosAroundDay` and the sprint report), `dueDate?` |
| `FollowUpUpdate` | `note`, `doc Json?` (TipTap JSON from the rich editor; `note` is then its plain text, derived server-side), `channel` (free text from the user's list), `occurredAt`, `fromThem` (their reply vs. what you said — drives Waiting/Replied). **Never updated in place.** |
| `FollowUpFile` | `userId`, `followUpId?` (set when the update that references it is saved), `name`, `mimeType`, `size`, `data Bytes` (≤4 MB). Uploaded while writing; deleted with the entry or account. |
| `Note` / `NoteSection` / `NotePage` | icon (`iconName`, `iconLibrary` si/lu/fa6), `favorite`, `deletedAt` (trash); sections & pages ordered by `order`; page `content Json` |
| `Resource` | `type` (free text from the user's list; was an enum), `url?`, `content`, `tags[]`, `favorite` |
| `SprintReport` | one per `(userId, sprintStart)` (`@db.Date`, UTC midnight like `WorkLog.date`); `content` (Markdown), `model?` (null = built), `generatedAt` |
| `Achievement` | `title`, `type` (free text), `status` (`AchievementStatus` InProgress/Completed), `assignedBy?`, `startDate?`/`endDate?` `@db.Date`, `description` |
| `AchievementFile` | `name`, `mimeType`, `size`, `data Bytes` (≤10 MB); `userId` denormalised for owner-only download. **`data` never selected in lists.** |
| `Task`, `Link` | exist with actions; no UI yet |
| `UserList` | PK `(userId, kind)`; `values[]` (ordered options, or saved-ahead names for Project/NoteTag/ResourceTag), `hidden[]` (Project: in-use names no longer suggested), `icons Json` (ResourceType: value → `"library:Name"`). No row = built-in defaults; a row whose values equal the defaults isn't "customised" (it may exist only for icons). |

**Enums:** `UserRole`, `DayType`, `AttachmentKind`, `TicketStatus` (11 values, 6 used for new
writes), `TaskPriority`, `TaskStatus`, `FollowUpStatus`, `EntryKind`,
`UserListKind`, `AchievementStatus`. (`FollowUpChannel` and `ResourceType` became free-text columns on
2026-10-01 — their options live in `UserList`.)

## 6. Critical invariants

1. **User isolation.** Every regular read/write filters by the session `userId`. Ownership is
   checked before creating child rows (`assertWorkLogOwned`, `assertTicketOwned`,
   `findFirst({ id, userId })`). Use `updateMany`/`deleteMany` with `userId` in the
   WHERE for single-row mutations. Cross-account exceptions live only in `lib/admin.ts`,
   must call `requireAdmin()` first, never trust a client-supplied role, and require the
   exact target email for destructive operations. The `/api/mobile/*` handlers take the
   `userId` from a verified bearer token (`verifyMobileToken`) instead of the session.
2. **Append-only ticket history.** All work-update writes go through
   `prisma.ticketWorkUpdate.upsert` keyed on `(ticketId, workLogId)`:
   same log → in-place (autosave-safe), different log → new row. No code path may
   update "the latest update" or blind-create.
3. **Ticket status follows the newest update**; detaching recomputes it.
4. **Tracker updates are append-only** — no edit/delete action exists for a
   `FollowUpUpdate`; a first note is created as an update row, not a field. Whole-account
   or whole-workspace erasure is the deliberate privacy/admin exception.
5. **Dates:** `WorkLog.date` is UTC midnight (`toDateOnly`, `todayUtc`). Sprint maths
   and "today" in the Tracker use **local** calendar days (`lib/sprint.ts`; the board
   corrects to the browser clock after hydration via `useSyncExternalStore`).
   Dates cross the server→client boundary as ISO strings.
6. **Get-or-create races** are handled by the unique index: on `P2002`, re-read the
   winner's row.
7. **Uploads use route handlers**, not server actions (actions cap bodies at 1 MB).
   Downloads: owner-only, safe types inline (png/jpeg/gif/webp/pdf/txt), everything else
   forced to download, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.

## 7. Environment

`app/.env` (gitignored; template `app/.env.example`):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://workspace:workspace@localhost:5434/workspace?schema=public` locally; pooled Neon URL on Vercel |
| `AUTH_SECRET` | Auth.js secret (`npx auth secret`) |
| `AUTH_TRUST_HOST` | `true` |
| `SEED_EMAIL` | email of the account `db:seed` creates; setup writes `demo@worknest.local` (unset → falls back to the owner's email) |
| `SEED_PASSWORD` | password seeds give the demo account (8+ chars); setup generates one |
| `HOSTED_DATABASE_URL` | Neon **direct/unpooled** URL for `npm run db:hosted` |
| `OPENROUTER_API_KEY` | optional server-wide key for AI work-log summaries; a user's Profile key takes priority |
| `OPENROUTER_MODEL` | comma-separated fallback list; default `google/gemma-4-31b-it:free, openrouter/free` |
| `GROQ_API_KEY` | optional backup AI: used when OpenRouter fails or has no key |
| `GROQ_MODEL` | comma-separated Groq models, tried in turn when one is rate-limited; default `openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b` (all call tools) |

`app/.env.vercel` (gitignored) holds values to paste into Vercel. Never commit real
env files; the GitHub repo is public.

## 8. Scripts

Root (`/package.json`, `engines.node >=20.9`):
`setup` (`scripts/setup.mjs`: check Node + Docker → create `app/.env` with generated
`AUTH_SECRET`/`SEED_PASSWORD` if missing → `npm ci` if `node_modules` missing or the
lock changed → `docker compose up -d --wait` → `prisma migrate deploy` → `db:seed`
**only when the `User` table is empty**; every step is idempotent), `dev` (runs `setup`
then app dev), `build`, `start`, `lint`, `typecheck`,
`install:app`, `db:up`, `db:down`, `db:seed`, `db:studio`, `db:migrate`, `docs:check`
(`scripts/check-docs.mjs`: every `app/src` file is in the code map skill and every map
path exists; `--hook` also flags code changes with no doc change).

App (`/app/package.json`):

| Script | Does |
|---|---|
| `dev` / `build` / `start` / `lint` | Next + ESLint |
| `typecheck` | `next typegen && tsc --noEmit` — typegen first so `LayoutProps` etc. exist on a fresh clone |
| `postinstall` | `prisma generate` (required — client is gitignored) |
| `db:migrate` / `db:reset` / `db:studio` | Prisma |
| `db:seed` | `prisma/seed.ts` — demo user + multi-entry ticket history |
| `db:seed:bulk`, `db:seed:fill`, `db:seed:notes` | older bulk/fill/notes seeds (`fill [-- email days]` also tops up *empty* auto-created logs in the window) |
| `db:seed:sprint [-- email]` | reset one account's content; fill current sprint with work logs + tickets |
| `db:seed:tracker [-- email] [--append]` | replace one account's Tracker entries with a realistic mix; `--append` keeps existing entries and adds a second, different set |
| `db:seed:workspace [-- email]` | fill one account's Notes + Resources with study content (re-runnable) |
| `db:seed:achievements [-- email]` | fill one account's Achievements (7 items; replaces only its own titles) |
| `db:hosted [-- --seed]` | `prisma migrate deploy` (+ seed, which wipes users) against `HOSTED_DATABASE_URL` |
| `vercel-build` | Vercel only (it runs this instead of `build`): `VERCEL_ENV=production` → `prisma migrate deploy` (`DATABASE_URL_UNPOOLED` or `DATABASE_URL`), then `next build --webpack`; Preview skips migrating. A failed migration fails the build, so the previous deploy stays live |

## 9. Deployment

- **Local:** `npm run dev` from the root (Docker Postgres on 5434 + Next on 3000). The
  dev server also accepts the LAN origin `192.168.31.130` (for testing from another
  device) — update `next.config.ts` if the LAN IP changes.
- **Hosted:** Vercel with **Root Directory = `app`** + Neon Postgres. Its HTTPS origin
  makes the web app installable. Vercel env:
  `DATABASE_URL` (pooled), `AUTH_SECRET`, `AUTH_TRUST_HOST=true`. `postinstall`
  generates the client. **Production builds apply migrations** (`vercel-build`,
  2026-10-22) before `next build`; Preview builds never do. `db:hosted` from a laptop
  still works for a manual run or `--seed`. If the Vercel project overrides the Build
  Command, `vercel-build` is ignored — leave it on the default.
- Attachments live in Postgres, so they survive serverless hosting.

## 10. Legacy / dormant code

- `.dark` token blocks, `--pf-*` night values — dormant (no theme toggle).
- `Task` / `Link` models + actions — no UI (routes are Coming Soon).
- `TicketStatus` legacy enum values — kept for historical rows; normalised on read.
