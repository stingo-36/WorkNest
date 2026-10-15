# PRD — WorkNest

> **What we're building.** Keep this file true to the code. When a feature ships,
> changes scope, or is retired, update the matching section here (see
> `AGENTS.md → Keeping the docs current`).
>
> Last synced with the codebase: **2026-10-15**

---

## 1. One-line pitch

WorkNest is a private, single-user workspace for a software professional's working
day: daily work logs, ticket history, follow-ups, notes and a resource library —
recorded as it happens so the record can answer *"what did I do, when, and in what
order?"* months later.

> Naming: the product was called **Personal Workspace** until the rebrand. The repo
> folder, the Docker container (`workspace-db`) and root `package.json` still use the
> old name. The UI, metadata and homepage say **WorkNest**.

## 2. Users & situation

- **Who:** one working software professional (the author) who is accountable ticket by
  ticket and day by day — stand-ups, sprint reviews, one-to-ones — and is regularly
  asked *"what happened with ASU-1234?"*.
- **Private workspaces by construction.** Registration is open and every row is scoped
  to a `userId`; regular users cannot see another account's data. An explicit Admin
  role can see cross-account statistics in `/admin`. No teams, sharing or collaboration.
- **Primary moment:** the end of a working block, with ~90 seconds of willingness to
  write things down. Capture must be cheaper than remembering.
- **Device:** desktop-first, used every working day; must still work down to 360px.

## 3. Product principles

1. **The record is append-only.** Past ticket work and tracker updates are never
   rewritten. Correcting the record means appending a newer, dated entry.
2. **Capture is cheaper than remembering.** Tickets are found or created *inside*
   today's log — no page change, no modal. Autosave everywhere it's safe.
3. **One person's record.** Each workspace belongs to one person. Admin statistics
   are oversight, not a team or sharing model.
4. **Only what exists.** Deferred features and unbuilt routes are never presented as
   available; no invented social proof (users, logos, testimonials, numbers).
5. **Not an admin panel.** Dense and fast, but it should feel like Linear / Notion,
   not a CRUD table.

## 4. Feature inventory (current state)

Status legend: **Live** · **Hidden by setting** · **Coming soon** (authenticated
placeholder page) · **Retired** (redirects).

| Area | Route | Status | Summary |
|---|---|---|---|
| Homepage | `/` | Live (public) | "Next Level" page: serif hero "Keep it all in one place." with four 3D characters on brush strokes; then **Workspace** (`#workspace`, auto-playing tour of Work logs / Tracker / Notes / Resources), **AI summaries** (`#ai-summaries`, notes → summary → 5-15 report, with a 3D character) and **Get started** (`#get-started`, three steps + closing CTA + footer). Desktop scrolls one full-screen section at a time. Login/register use the same style with a 3D character panel. |
| Banner review | `/banner` | **Retired 2026-10-03** | The old "Quiet Studio" homepage review route was removed with its code; the URL now goes to sign-in (signed out) or the 404 page (signed in). |
| Auth | `/login`, `/register` | Live (public) | Email + password. Direct admin sign-ins land on `/admin`; regular users land on `/tracker`. |
| Work Logs | `/work-logs`, `/work-logs/[id]`, `/work-logs/[id]/edit` | Live | The core workflow — see §5.1. |
| Tickets | `/tickets` | Live · hidden when *Tickets* is off in Profile | Master-detail ticket manager — see §5.2. |
| Tracker | `/tracker` | Live — **post-login landing page** | To-do · Follow-ups · Notes tabs (`?view=`), two-column layout from the owner's mockup (2026-10-14) — see §5.3. |
| Notes | `/notes`, `/notes/new`, `/notes/[id]`, `/notes/[id]/edit` | Live | Notebooks: note → sections → pages — see §5.4. |
| Resources | `/resources` | Live | Typed personal library — see §5.5. |
| Favourites | `/favourites` | Live | Everything starred in one place — see §5.6. |
| Quick log | dialog (nav button, Work Logs header) | Live | Paste rough text → AI draft → review → apply, for a work log, to-dos or follow-ups — see §5.10. |
| Profile | `/profile` (account menu) | Live | Name, sprint calendar, tickets on/off, AI summary key — see §5.7. |
| Achievements | `/achievements` (account menu) | Live | Certifications/courses/awards timeline with certificates — see §5.8. |
| Reports | `/reports` (account menu) | Live | "5-15 Report" per sprint, ready to paste into a doc — see §5.9. |
| Installable app | manifest + account menu | Live | Install WorkNest on a phone or desktop and launch it in its own app window — see §5.11. |
| Admin dashboard | `/admin` (Admin account menu only) | Live · Admin only | Searchable account operations: statistics, password reset, record erasure and account deletion — see §5.12. |
| Dashboard | `/dashboard` | **Retired 2026-09-25** | Redirects to `/tracker`. |
| Tasks, Links, Settings | `/tasks`, `/links`, `/settings` | Coming soon | Shared `ComingSoonPage`. `Task`/`Link` tables and actions exist but have no UI. |

Primary nav (2026-10-14): a **full-width sticky bar at the top** of every screen — Work Logs ·
Tickets (only if enabled) · Tracker · Notes · Resources · Favourites, then the account
avatar (Profile & settings, Reports, Achievements, Install WorkNest when available,
Log out; opens downwards). On phones the bar is limited to five labelled items,
and Favourites moves into the account menu so navigation never has to squeeze or overflow.
Quick log lives on the Work Logs page.

## 5. Features in detail

### 5.1 Work Logs — the core workflow

**The one feature that matters most:** *Work Log → find/create ticket → append work
update.*

- **One log per user per calendar day** (`@@unique([userId, date])`). Opening a day
  creates it if missing.
- **Day type:** `Work`, `Holiday` or `Leave`. Holiday/Leave days account for the day
  without meetings or ticket work; their default titles are "Holiday" / "Leave"
  (a work day defaults to "Daily Work Log"). Auto-generated titles are hidden in the UI.
- **Listing (`/work-logs`, deck redesign 2026-10-09):** the **current sprint only**. An
  eyebrow (sprint dates · day N of M), a large **Work Logs** title, a **Jump to a day or
  ticket** search (⌘K; matches this sprint's dates, titles and ticket keys/titles, and opens
  the picked day) and a legend. Below: the **sprint deck** — one column per weekday (logged · day off hatched · no log amber dashed with + ·
  today ink · upcoming / sprint ends), a *Weekend* spacer between weeks; clicking a column
  grows it into the **day card** (animated): big date, status chip, View full log / Edit log,
  title (split on `|`), then four sections — **Summary** (AI summary if generated, else one
  status-marked row per ticket update; shown only for a logged day — a day with no log
  offers Start log / Mark holiday / Mark leave on the right of the header instead), and that day's Tracker **To-do list** (overdue, due that day, created that day, done — each a tinted card),
  **Follow-ups** (entries created or written to that day: person, subject, latest note,
  waiting / replied / closed) and **Notes** (created or added to that day), each with an
  Open link to its Tracker tab. Summary sits on the left; of the lists that exist (in the order to-dos, follow-ups, notes), the first goes on the right, the second under Summary on the left, the third back on the right. **Empty sections are hidden** (no "No X that day" rows), so whichever lists exist move up. `?day=` keeps the open day. From lg the page fits the screen
  above the dock (the card scrolls inside); below lg the columns become rows. Future days
  inert. Earlier sprints aren't browsable here (the full log and Reports cover them).
- **Editor (`/work-logs/[id]/edit`, redesigned 2026-10-08 as a document page):** an
  action strip (prev/next log arrows, All work logs, day type, save status, View log),
  then the log as **one white document** — large date, title field, and each section
  as a chapter under a dark rule — with a right margin (xl+) holding an **On this page**
  outline (jumps to sections, shows progress) and the day's to-dos. Sections:
  1. **Meetings** — every new log starts with the user's **Default meetings** list
     (Profile; built-in: *ASU Sync-up*, *Veritech Sync-up*, *Client Sync-up*).
     Additional cards can be added and removed per log.
     Notes are Markdown (TipTap WYSIWYG, saved as Markdown text).
  2. **Tickets** (only when tickets are enabled) — type a key such as `ASU-1234`:
     - exists for this user → attach it, show title, status, recent history;
     - doesn't exist → create inline (key, title, project/site). No modal.
     - Write *work done today* and set the status. This upserts **one**
       `TicketWorkUpdate` for *(ticket, this log)*; the ticket's current status
       follows it.
     - Removing a ticket from a log deletes only that log's update row and recomputes
       the ticket's status from the newest surviving update.
  3. **Work done** — a free Markdown daily summary, independent of tickets.
  3a. **To-dos** (read-only, from the Tracker; editor and detail view) — to-dos
     *completed that day* and to-dos *due by that day but not done by its end*
     (overdue / due that day), in the browser's local day. Links to `/tracker`.
  4. **Attachments** — upload files (≤10 MB each, ≤10 per upload) or add links.
- **Autosave** is debounced, shows a save-status indicator, never toasts, and never
  creates duplicate rows.
- **Detail (`/work-logs/[id]`, redesigned 2026-10-15 from the owner's mockup):** "‹ All
  work logs" with ‹ › to neighbouring logs on top; a full-width **dark hero** (date + day
  type, the log's title — or the date — Edit log, **Copy as text**, and three counts:
  tickets / meetings / to-dos done); then the log on the left — **AI summary**, **Ticket
  work**, **Meetings** as note tiles (3 across on wide screens) — and a sticky right column:
  the day's **To-dos**, **Ticket history**, and **Details** (Work done, attachments &
  links, activity + who).
- **AI summary and title in the background (2026-10-09):** leaving a log's editor
  (navigating away, closing or reloading the tab) refreshes the AI summary in the
  background — and the **title**, while it's still the default "Daily Work Log" or was
  written by the AI. It runs **only when the log's content changed** since the last run
  (a fingerprint of what the AI reads), so reopening and leaving a log costs nothing. A
  title the user types is never overwritten (clearing it hands it back to the AI). Titles
  look like the owner's own: 1–3 pieces of work in Title Case joined by " | ".
- **Summary (detail page):** generated **once automatically** the first time the log
  is viewed with content in it (if the background run hasn't already), and whenever the
  user clicks *Regenerate*. **AI
  only** via **OpenRouter** (free models by default; key from Profile → Account → AI
  summaries card, else the server's `OPENROUTER_API_KEY`). **No code-built fallback:**
  with no key the card says AI isn't set up (link to Profile) and generates nothing; if
  a request fails it shows why (key rejected, rate-limited, no credit, unreachable,
  unusable reply) and keeps any saved summary. Output is **a few bullet points, no
  headings or section labels**, one per item, covering everything in the log. The AI
  reads tickets (if on), Work done, and that day's Tracker **to-dos** (done, due, overdue,
  created), **follow-ups** and **notes** — the same as the Work Logs day card, in the
  browser's local day. **Meetings are not sent** (owner, 2026-10-09). The card
  shows the model. Stored on the log (older code-built summaries are hidden); a note appears when the log was edited after the
  summary was generated. Generating doesn't change "Last edited".

### 5.2 Tickets

- Ticket keys are free text in the user's own scheme, **unique per user**, not
  globally. No Jira sync.
- `/tickets` (redesigned 2026-10-11 in the shared page style): the **Tickets** title,
  "N tickets · your own key scheme" and a stacked bar by status, a **New ticket** button
  for standalone creation, and a search pill (⌘K);
  then **underline status tabs** (All · In Progress · Sent to QA · Ready for production ·
  Released · Done, with counts; In Progress by default) replacing the status dropdown;
  then the **ticket list** (key chip, status, title, project, log count; the selected row
  gets an ink bar) beside the **open ticket** card (key, status, title, project; then
  a compact journey, newest-update summary, add-update form and newest-first history).
  From lg the list sticks while the ticket
  scrolls with the page; on phones and tablets the list comes first and tapping a
  ticket scrolls to it. The first ticket in the list is open by default.
- Edit the ticket's current **ticket number**, **title**, **status** and **project/site**
  directly. Ticket numbers remain unique within the signed-in user's workspace.
- **Standalone updates** written on this page are `TicketHistoryEntry` rows. They can
  be deleted (with confirmation). Work-log updates (`TicketWorkUpdate`) are shown in
  the same newest-first timeline, labelled by source, and can **never** be edited or
  deleted from here.
- A ticket "journey" view accounts for holiday/leave days.
- **Workflow statuses (UI):** In Progress → Blocked → Sent to QA → Ready for Production →
  Released → Done. Legacy stored values (Open, Waiting, Testing, Completed, Closed) are
  normalised into these six.
- **Project / site** lives on the ticket (moved from the work log on 2026-09-25) and
  autocompletes from names already used.
- If *Tickets* is switched off in Profile, the nav item disappears, `/tickets`
  redirects to `/work-logs`, and the editor hides the Tickets section.

### 5.3 Tracker

Three tabs (`?view=todo|followups|notes`) in the Work Logs teal-and-ink palette. Layout
from the owner's mockup (2026-10-14, second pass): a top line with the date on the left and
the tabs (open counts; Follow-ups amber when one needs you) plus a compact search pill (⌘K;
text and `#tag`) on the right; then **Tracker** with the tab's underline **add field** beside
it (Enter or *Add* saves; tool buttons open small panels). Below, **two columns** from lg
(stacked on smaller screens), each a big title + count over a 2px rule (amber when
something needs you). Rows carry an uppercase status eyebrow ("NUDGE DUE · ASHWINI").
The latest saved update appears under each to-do and follow-up title (*Latest reply* /
*Last note*), so routine context is visible without opening the dialog; note rows show
only their title, tags and when they changed. Finished items sit in one collapsed **Completed / Closed / Archived** group
(*Show*/*Hide*; a search opens it) grouped by completion date. New reminder dates default to today,
Slack is the default channel, and the required **Who** field filters saved names as the
user types while still accepting a new name. Reminder copy explains that the selected
date is when WorkNest should prompt the user to follow up again if nobody has replied.

| Tab (`EntryKind`) | Tab badge | Add | Columns | Row actions |
|---|---|---|---|---|
| **To-do** (`Task`) | overdue/due-today to-dos + follow-ups that need you | title · due date · ★ | left **Today** (incl. follow-ups: nudge due / replied) + "✓ N completed today · Show"; right **Upcoming** by *tomorrow's date · Later this week · Next week · Later · No date* (to-dos + future nudges) | round tick (done / close / reopen) · ★; follow-ups: Mark nudged / Got it |
| **Follow-ups** (`FollowUp`) | replies + nudges due | title · who + where (channel) · nudge date | left **Needs you** (*Your turn* · *Nudge due*) + collapsed closed line; right **Waiting** | Mark nudged · Got it (= close); replied: Got it · Open |
| **Notes** (`Note`) | open notes | left **New note** composer: title · body · formatting · tags · ★ (+ collapsed archive) | right **Notes** (favourites first, then recently updated; title, tags and "Updated …" only — the text stays inside) | Open · ★ |

- **Mark nudged** appends an "I followed up" update ("Nudged", last channel) and clears
  the nudge date, so the row moves to *Waiting*.
- A follow-up needs a person: *Add* without one opens the Who panel with an error. The
  title is recorded as the first message (with the channel).
- Writing (new note body and every add-update field) uses a **rich editor** (2026-10-15)
  with its toolbar inside the field: bold, italic, underline, strike, highlight, inline
  code · heading, subheading · bulleted, numbered, checklist, quote, code block, divider ·
  link, **upload image**, **attach file** · undo/redo. Pasted formatted text keeps its
  formatting; pasted Markdown-looking text (lists, headings, `**bold**`…) is converted;
  pasted or dropped images/files upload (≤4 MB each, ≤5 at a time) — images show inline,
  other files become 📎 links. Saved as TipTap JSON plus a plain-text copy, so search, AI
  summaries and Work Logs read it unchanged. Older plain-text updates still render with
  the small Markdown subset.
- **Every large text field** has the same kind of editor (2026-10-15): Work Log and
  Ticket Markdown fields, Resource and Achievement descriptions get bold, italic, strike,
  inline code, heading, subheading, lists, quote, code block, link, **image upload** and
  **file attach** (paste/drop too; Markdown text pastes as formatting). They still store
  Markdown — links as `[text](url)`, images as `![alt](/api/tracker-files/…)` — and render
  formatted; Favourites shows a plain preview. Single-line fields stay plain.
- A new note is a composer card: title, the editor (saved as its first update), an
  optional **date** (defaults to today; sets the first update's date), tags and ★.
  Tag chips on note rows put `#tag` in the search (the old tag-chip filter row and
  *Group by tag* were dropped with the redesign).
- Any entry can be **starred as a favourite** (sorts first; open ones show in Favourites).
- Every row has a **delete** button (trash, shown on hover/focus from md, always on phones)
  with a confirmation; the dialog keeps its own Delete too. *Today* lists to-dos before
  the follow-ups that need you.
- Clicking a title (or *Open*) opens the entry in a wide **dialog** at every width — two
  columns from md: on the left status, date (editable), Done / Close / Archive, star,
  delete and the add-update form (formatting bar; follow-ups pick "I followed up" or
  "<person> replied" + channel); on the right the timeline.
- **Follow-up state is derived, never stored:** if the newest record is *their* reply
  (`FollowUpUpdate.fromThem`) it is *their reply → your turn*, otherwise waiting.
- Updates are **append-only** (`note` + channel + `occurredAt`). There is no action to
  edit or delete a single update. A whole entry can be deleted.
- Empty columns keep their heading and say so ("Nothing else is waiting on anyone.").
  Search narrows both columns and opens the collapsed finished line. "Today" is the browser's local day.
  People previously used are suggested.

> Naming: the models are still `FollowUp` / `FollowUpUpdate` and the files
> `follow-ups.ts`. The UI and route say **Tracker**.

### 5.4 Notes

- OneNote-shaped notebooks: **Note → Sections → Pages**. Pages are TipTap rich-text
  documents (headings, lists, tables, highlights, alignment, syntax-highlighted code
  blocks).
- Each note has a title, description, an icon (searchable react-icons: Simple Icons,
  Lucide, Font Awesome 6) and an accent colour derived from the icon (brand colour
  when known).
- Favourite notes sort to the top. Deleting moves a note to trash (`deletedAt`);
  notes can be restored.
- **List (`/notes`, bookshelf 2026-10-08; layout "F" 2026-10-10 from the owner's
  screenshot):** title **Notes** + today's date, a search pill (title, description,
  section names; ⌘K) and an ink *New note* button. Left (sticky from lg): *Your
  notebooks*, the notebook count huge, "Hover a book to peek inside", a bar per notebook
  in its cover colour, then sections / pages / starred as ruled rows. Right: one **book
  cover** per notebook (starred first) in
  the note's accent colour — spine, a fine dot texture, the note's icon large and faded as cover art, the icon badge, title, first 3 section names (+N) — with a
  star on the cover and the description, size and updated date under it. The last
  cover is a dashed *New notebook*. On hover/focus a book **opens** (the cover swings
  on its spine, 3D) to show a contents page (first 7 sections); the whole book is the
  link that opens it. Reduced motion: no animation. 2 covers per row on phones, 3 from md, 4 from xl.
- **Reading a note (`/notes/[id]`, redesigned 2026-10-02):** a documentation-style
  reader. **Everything is open** — every section and page in one continuous column
  (section opener: *Section X of N · N pages* + large title; pages numbered *2.3* with
  large titles). A **sticky bar** under the app header always shows the section you
  are in › the current page (and *Section X of N*), switching as you scroll. At lg+ a
  sticky left sidebar holds the note (icon, title, counts), **every section with all
  its topics listed** (the section name pins while its topics scroll past; the current
  page is highlighted, neutral colours — not the note's accent). **Star / Edit / Trash
  sit in the sticky bar** (lg+). Below lg the note header (with the actions) sits at the
  top and a ☰ button in the bar opens the same contents list. The current page is
  measured from scroll position each frame; clicking a topic smooth-scrolls to land
  under the bar — the scroll follows the heading frame by frame and pages it flies
  past wait to load until it lands, so there is no snap at the end (2026-10-04).
  Level-2 headings inside a page show as tinted bands, so each block of a topic
  (e.g. Definition, Example) is easy to spot. Since 2026-10-08 it is a **three-column
  docs layout** at xl (1440+): contents on the left (current section a slate pill,
  current page sky), the reading column, and an **On this page** rail on the right
  (the current section's pages + how far through the note you are).
- **Editing a note:** the *At a glance* outline beside the editor is capped to the
  screen and scrolls on its own; clicking a section/page there smooth-scrolls to it.
  A page's editor mounts only when it comes near the screen (long notebooks stay
  smooth to scroll).

### 5.5 Resources

- A personal library whose **types come from the user's list** (Profile; built-in:
  Website, App, Link, Documentation, Command, Snippet, Reference, Tool, Learning,
  Other). Each type has an **icon**: the one picked in Profile, else one guessed from
  the name ("Github" → GitHub logo, "Commands" → terminal, "Vibe Coding" → sparkles…),
  else a bookmark. Icons render bare (no tile) in the dropdown and on cards. Each
  resource has a title, optional URL, **one Description** box, and tags; *Command* /
  *Snippet* also have the code itself (monospace, with Copy) plus a short description.
  (2026-10-02: the separate "Notes or details" box was removed; old text in it is
  folded into Description when the resource is next edited.)
- Grouped by type and searchable — every word must match title, description, content,
  URL, type or a **tag** (`#` ignored, spaces = dashes, so "vibe coding" finds
  `vibe-coding`) — and each resource can be **favourited**, **edited**
  (pencil on every card/row → the same form, prefilled) or deleted.
- Layout (owner's mockup, 2026-10-14): **Resources** title + one-line description on the
  left; an underline search (⌘K; text and `#tag`) and an ink **Add resource** button on
  the right; a rule. Below, a **Type / Tags** column (a sideways strip above the list under
  lg): *All* (default) then each type with counts, on a dark panel with the current one
  as a light pill; tags in **colour-coded text** (no fill) with counts (brand colour for known tags such as
  *android* or *github*, else a stable colour from the name; a click shows All filtered by
  `#tag`, again clears). Row tags and Tracker note tags use the same capsules. Beside it
  one list headed "ALL RESOURCES · 7" (or the type) with a sort menu (*Recently added* ·
  *Recently updated* · *A–Z*). Each row: an initials tile (ink / teal / amber, fixed per
  title), the title (opens the URL ↗) with the site in mono, description, tag capsules;
  edit/delete on hover from md and the star. Commands/snippets add their code line with Copy.
  Types that read the same on screen (built-in *Website* shows as "Websites", like a
  custom *Websites*) are one type, and Profile refuses adding such a duplicate.
- In the add/edit form, **Resource type** is a searchable dropdown (type "doc" →
  Documentation) and **Tags** is a search-as-you-type chip field that suggests tags
  already used (most used first). Enter or a comma adds a new tag; tags are stored
  lowercase without "#", spaces become dashes.

### 5.6 Favourites

Aggregates favourite **notes**, favourite **resources**, and **Important** (starred,
open) **tracker** entries. Redesigned 2026-10-11 from the owner's screenshot: the
**Favourites** title and "Everything you starred, in one place.", then **underline tabs**
— *All · Important · Notes · Resources* with counts (`?show=important|notes|resources`).
*All* shows **Important** ("N open in Tracker", an *Open Tracker →* button) as two
columns of items, a rule, then **Notes** and **Resources** side by side. Each item is a
disc (ink with an amber star; the notebook's colour and icon; a resource's initials), a
meta line (kind · person · due date / sections · updated / site), and a big title that
opens it (resources with a URL open the site ↗; commands/snippets show their code). An
empty group says how to fill it with a *Go to …* link. One tab shows just that group in
two columns.

### 5.7 Profile

- Display name (email is read-only).
- **Change password:** current password + new password + confirmation. A successful
  change revokes every existing session for that account and returns the browser to
  sign-in; passwords are never revealed.
- **Sprint calendar:** start date and length (1, 2, 3 or 4 weeks) with a live preview
  of the current sprint. Default: 14-day sprints anchored on 2 Sep 2026.
- **Tickets on/off:** whether ticket tracking exists for this user (see §5.2).
- **AI summaries** (a card under Account): the user's own **OpenRouter API key** (checked with OpenRouter on
  save, stored encrypted, never shown again — only its last 4 characters) and an
  optional model list (empty = free Gemma, then any free model). Saves on its own, not via the bar.
  The user's key takes priority over the server's `OPENROUTER_API_KEY`; with neither,
  AI is off and no summaries or reports are generated (§5.1, §5.9). Shows a privacy note about what is sent.
- Layout (redesigned 2026-10-08): an identity header (avatar, name, email, sprint
  length, tickets on/off); **one horizontal tab bar** for every section, grouped
  (*Settings*: Account (with the AI summaries card), Sprint calendar, Work logs ·
  *Dropdown lists*: Follow-up channels, Resource types, Default meetings, Projects /
  sites · *Tags*: Note tags, Resource tags; scrolls sideways on phones); Account /
  Sprint calendar / Work logs are **label-and-control rows**. **Only the chosen section
  is shown** (`?section=` keeps it on refresh). Account/sprint/tickets save together via
  a bottom bar that appears once something changes; tabs with unsaved edits show a dot.
- **Dropdown lists** (save immediately; removing an option never rewrites items
  already using it):
  - *Follow-up channels* (Tracker "Where"), *Resource types*, *Default meetings* —
    add, remove, **drag to reorder** (⋮⋮ handle — mouse or touch; ↑/↓ keys on the
    focused handle), and **Reset** to the built-in list. *Resource types* also have an
    **icon picker** per row and on the add row (the notes icon index: Simple Icons,
    Lucide, Font Awesome); Reset keeps picked icons. Rows show no position numbers.
  - *Projects / sites* — ticket project suggestions = names on tickets + names added
    here; removing one stops suggesting it (tickets keep their project).
- **Tags** — separate *Notes* and *Resources* lists: every tag with its usage count;
  **add** (saved as a suggestion before use), **rename** (applies to every item;
  merges if the new name exists), **delete** (removed from every item, with a
  confirmation stating how many) and **Delete all** (every tag of that list, removed
  from every item, after a confirmation).

### 5.8 Achievements

- Own page `/achievements`, reached from the **account menu** (added 2026-10-01;
  briefly lived inside Profile the same day). Certifications, courses, awards. Each has a title, type (Certification, Course, Award, Hackathon,
  Promotion, Other), status (Completed / In progress), optional *assigned by*, start
  and end dates (the card shows the **inclusive** day count), a description and
  **certificate files** (PDF/image, ≤10 MB each, open inline). Add/edit in a popup —
  files picked there upload when you save; saved files can be removed. Delete asks
  for confirmation and removes the files too.
- Layout (redesigned 2026-10-08): a totals strip (completed · in progress · days of
  effort), then a **timeline grouped by year** (in-progress group first, each year a
  slate pill) with a medal per entry on a rail — **in the centre with cards alternating
  left/right from lg**, on the left at md, full-width cards on phones. Card = type /
  status eyebrow, title, description, a facts strip (Started · Finished · Duration ·
  Assigned by), and a certificate footer row ("View certificate"). Edit/delete show on
  hover/focus at lg+, always on touch widths.

### 5.9 Reports

- `/reports?sprint=YYYY-MM-DD`: pick a sprint from a **row of sprint cards** (current,
  plus every earlier sprint with logs; each shows its log count and whether a report is
  saved). Below (2026-10-08), a "desk": a toolbar (copy buttons, Generate/Regenerate)
  above the report rendered as a **sheet of paper**.
- **Generate report** builds the user's **"5-15 Report"** in their doc format:
  `{Name} 5-15 Report`, `(dd-MM-yyyy to dd-MM-yyyy)`, **Completed This Week** (groups
  titled `Ticket <key> - <title>` or a topic, with full-sentence bullets) and
  **Problems or Blockers**. Source: the sprint's work logs (ticket updates, Work done)
  and to-dos completed / still overdue at sprint end. **No meetings section** — meeting
  notes are only context the AI may fold into related work.
- **AI only** via OpenRouter (same key as summaries). With no key the page says so and
  the Generate button is disabled; if a request fails or the reply ignores the format,
  the reason is shown and nothing is saved (an existing report stays). No code-built
  report; older ones are hidden. Stored per sprint; *Regenerate* replaces it; a note
  appears when a log in the sprint changed after generation.
- A copy bar on the report offers **Copy for Google Docs** (formatted) and **Copy as
  plain text**. The preview and the formatted copy follow the doc's layout: centred bold title with the
  date line, light-blue section bands, bold group titles, bullets. The clipboard gets
  HTML with the doc's own styles (Arial 20/14/15/14/11pt, band `#e6f0fa`) plus a
  plain-text fallback, so a paste into Google Docs matches the existing reports.

### 5.10 Quick log (added 2026-10-08)

A dialog opened from the nav's ⚡ button (any page) or *Quick log* on the Work Logs
header. Three steps:

1. **Choose** what to create: **Work log**, **To-dos** or **Follow-ups**.
2. **Paste** rough text (Work log also picks the day — weekdays, today or earlier).
   ⌘/Ctrl+Enter reads it. For a work log, **Use template** (shown while the box is
   empty) fills in headings for that day's meeting cards (or Default meetings), the
   user's open tickets (In Progress / Sent to QA, up to 6) and Work done — the user
   types under each; headings left blank are ignored.
3. **Review** what was read: every row has a tick box and an inline editor, and a
   label — *New*, *Update / Notes added*, or *Check ticket / Optional / Who?* when it
   needs the user. **Nothing is saved until Apply.** Apply then opens the day's log
   (work log) or the Tracker tab (to-dos / follow-ups) with a toast.

How the text is read — the AI does the fuzzy part, code the exact part:
- AI (OpenRouter, same key/models as summaries) splits the text into meetings,
  tickets, Work done and suggested follow-ups (or to-dos / follow-ups) as JSON.
- Code matches a written ticket key to the user's tickets: exact key, or a bare
  number to keys ending in it (`1233` → `ASU-1233`). Several matches → *Check
  ticket* with a picker. No match → a new ticket with that key. A ticket's status
  only changes when the text names one ("sent to QA"); "same status" keeps it.
- Meeting names match the day's cards / Default meetings ("asu meeting" → *ASU
  Sync-up*); unknown names become new meeting cards. People match names already
  used in the Tracker; channels match the user's channel list.
- Follow-ups found in a work log are **suggestions, unticked** by default.
- **Applying again on the same day appends** to that day's meeting notes, ticket
  update and Work done — never a second update row.
- To-dos are the one exception to "AI only": when AI isn't set up or fails, each
  line becomes a to-do without a date, and the review says why. Work log and
  follow-ups show the AI failure message and save nothing.

### 5.11 Installable web app (added 2026-10-11)

- WorkNest has a web app manifest, branded icons (including Apple touch and Android
  maskable icons) and standalone display metadata. An installed copy starts at the
  Tracker and keeps the normal authenticated routing.
- **Install WorkNest** appears in the account menu on a secure browser when the site
  is not already running as an installed app. Chromium uses its native install
  prompt; iPhone/iPad and browsers without that prompt show short **Add to Home
  Screen** instructions.
- A small service worker provides only the branded offline screen. It never caches
  signed-in pages, API responses or user data, so installed WorkNest remains
  network-first and does not expose a stale private workspace from its own cache.

### 5.12 Admin dashboard (added 2026-10-11)

- Accounts have a persisted **User / Admin** role. New registrations remain User by
  default; granting Admin is an explicit database-level choice.
- `/admin` is linked from the account menu only for Admin accounts and independently
  guarded on the server. A regular user who types the URL receives the 404 page.
- A direct Admin sign-in lands on `/admin`; regular users still land on `/tracker`.
- The dashboard is an operations console: four system totals, a searchable/selectable
  account directory, and a detail panel with per-user work-log, ticket, Tracker,
  notebook, resource, achievement and report counts, join date and latest activity.
- Admins can reset another account's password (which revokes all of that account's
  sessions), delete all workspace records while keeping its login/settings, or delete
  the account and every cascaded record. Destructive actions require typing the target
  email. The signed-in admin cannot reset or delete its own account here, and the final
  Admin account can never be deleted; self-service password change lives in Profile.

## 6. Non-functional requirements

- **User isolation:** every regular query is scoped by `userId` taken from the
  session, never from the client. Cross-account admin reads/mutations require a persisted
  Admin role checked by `requireAdmin()`; destructive mutations also verify the target email.
- **Security:** bcrypt (cost 12) passwords; constant-time login (dummy-hash compare)
  to prevent email enumeration; Zod validation on every mutation server-side; secrets
  only in env; uploaded files served with `nosniff` and only safe types inline.
- **Responsive:** 360 / 768 / 1024 / 1440. No horizontal page scroll.
- **Accessibility:** visible labels, keyboard operable, focus-visible rings, 3:1
  control boundaries, 4.5:1 text, `prefers-reduced-motion` respected.
- **Theme:** light only (the theme toggle was removed; see `Memory.md`).
- **Hosting:** self-host locally (Docker Postgres) or Vercel + Neon.

## 7. Out of scope (don't build, don't promise)

AI beyond the per-log summary, sprint report and Quick log reading; Jira / GitHub / Slack / Calendar integrations; PDF/Markdown export;
emailed reports; team workspaces; sharing; global search (not built yet);
dark mode (removed).

## 8. Open questions / next candidates

- Should standalone `/tasks` and `/links` be removed now that Tracker tasks and
  Resources cover them?
- Global search across logs, tickets, notes, resources.
