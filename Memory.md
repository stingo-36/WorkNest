# Memory — WorkNest

> Project memory for humans and agents: the current state, decisions already made
> (with the *why*), gotchas that cost time before, and a changelog. Newest first in
> every section. Update rules are in `AGENTS.md` §2.
>
> Last synced with the codebase: **2026-10-15**

---

## Current state (snapshot)

- **Repo:** https://github.com/stingo-36/WorkNest (`main`). The local repository metadata
  was reinitialized for this remote on 2026-10-11; its first commit and push are still
  pending owner approval. The prior local Git metadata was preserved temporarily for
  recovery. Typecheck, lint and build pass.
- **Live features:** homepage, auth, Work Logs, Tickets (toggleable), Tracker (landing
  page), Notes, Resources, Favourites, Profile, Achievements, Reports (5-15), optional AI
  summaries, Quick log. Coming soon: Tasks, Links, Settings. Retired: Dashboard, `/banner`. Details in
  `PRD.md` §4.
- **Hosting:** prepared for Vercel Hobby (root dir `app`) + Neon Free — the owner wants
  zero cost; deploy steps are theirs to run (see `skills.md` → Deploy). Before relying on
  uploads in production: files live in Postgres with a 10 MB limit, but Vercel functions
  take ~4.5 MB — lower the limit or move files to Vercel Blob (free, hard-capped).

## Decisions

Format: **date — decision.** Why. *Rejected:* alternatives.

**2026-10-15 — All large text fields get the full editor, still stored as Markdown.**
Owner: "all big description fields" should allow images, links and files. Work Log / Ticket
fields already used `MarkdownEditor`; it gained the toolbar, links, uploads and Markdown
paste, and Resource + Achievement descriptions switched to it. Keeping Markdown in the
existing text columns avoided a migration and kept AI summaries/reports readable.
Uploads from these fields use the Tracker upload table but never get a `followUpId` (see
the orphan gotcha). Notes notebooks already had their own editor. *Rejected:* TipTap JSON
columns on every model; the Quick log review boxes (AI draft text, short-lived).
Notes "Add page/section" buttons are tinted instead of white.

**2026-10-15 — Tag capsule colours come from a local brand table, not an API.** Owner asked
for tag colours "related to the tag, use some API". An external lookup would send every
tag name to a third party and miss made-up tags (`vibe-coding`), so `lib/tag-colors.ts`
holds Simple-Icons-style brand colours for common tech tags plus a hashed fallback; the
capsule mixes the colour so contrast holds. *Rejected:* Simple Icons CDN at runtime; one
accent for every tag.

**2026-10-15 — Tracker updates are rich text, with uploads in Postgres.** Owner wanted
paste-with-formatting, a full toolbar and image/file uploads. Reused the Notes TipTap
schema and stored `doc` JSON beside a server-derived plain-text `note`, so every existing
reader keeps working. Uploads follow the work-log attachment pattern (Postgres bytes,
owner-only route, inline only for script-free types) but cap at 4 MB for Vercel's ~4.5 MB
request limit. Images render only from `/api/tracker-files/`, so pasted web images
(hotlinks, tracking pixels) are dropped. Today lists to-dos before follow-ups.
*Rejected:* Vercel Blob (new service + env config; owner didn't choose when asked);
storing HTML (would need sanitising on every render); replacing `note` with the doc.

**2026-10-14 — Resources follows the owner's list mockup.** Tabs + two-column cards gave
way to a Type/Tags side column and one list of rows with initials tiles, a sort menu and
an underline search. Tile colours (ink, teal, amber) are fixed per title by a hash, so a
resource keeps its colour. *Rejected:* the per-type "Add <type>" button (not in the
mockup — Add resource preselects the current type); the mockup's "[Resource 5]"
placeholder row.

**2026-10-14 — Tracker becomes two columns (Today | Upcoming), add field beside the title.**
Second mockup the same day replaced the side "at a glance" column: no side panel, the
add field sits beside the title, tabs + search on the top line (owner: "only add tabs on
top"). Follow-ups split Needs you | Waiting; Notes split composer | notes. *Rejected:*
"See full calendar →" from the mockup (no calendar view exists); dropping search (kept
compact beside the tabs since `#tag` chips rely on it).

**2026-10-14 — (superseded the same day) Tracker side "at a glance" column, collapsed finished groups.**
Supersedes 2026-10-12's "no summary column" and "finished always visible": the owner sent a
mockup with Today / Upcoming (day buckets) / *Completed today · Show*, and a right column
(At a glance, Waiting on people, Notes). The owner first asked for a dark column, then
had the colour removed — it sits on the page. Notes got a real composer and the latest
update on each row; the entry dialog is two columns (form | history). Formatting is a
Markdown subset kept in the plain-text `note` so search, AI summaries and Work Logs keep
reading it unchanged. *Rejected:* TipTap JSON in updates (every reader would need to parse
it); the dark side panel; `@person` parsing in the to-do field (shown in the mockup's
placeholder, not built).

**2026-10-14 — Resource types are compared by their on-screen name.** Built-in *Website*
renders as "Websites", so a custom *Websites* made two identical tabs. `resourceTypeKey`
(the displayed plural, lower-cased) now dedupes the Profile list (client toast + server
`cleanValues`) and merges tabs on Resources; editing a stray resource saves it under the
list's spelling. Code/URL behaviour is keyed the same way so a custom "Commands" acts
like *Command*. Resources also gained an **All** tab (default; tag clicks go there).
*Rejected:* a data migration renaming types (the user owns their list's spelling).

**2026-10-14 — Primary navigation is a full-width sticky top bar, superseding the
bottom dock.** Section links are centred on desktop and use one dark-bar treatment; the
current page is a white underline instead of a white pill. Five labelled items plus the
account avatar fit on phones, with Favourites in the mobile account menu. The account
menu opens downwards. *Rejected:* keeping the floating bottom dock; an active white pill;
squeezing Favourites into the phone bar.

**2026-10-12 — Tracker prioritises the actual record over dashboard-style counts.**
The decorative summary column was removed, leaving one readable full-width queue. Latest
notes/updates stay visible on rows, and finished entries remain visible in completion-date
groups; completed to-dos sit before future work. Resources uses its selected type tab as
the only type heading, and Work Log to-do titles wrap instead of truncating. *Rejected:*
hiding completed work behind a count at the page foot; repeating the selected resource
type as a second heading; requiring a dialog merely to read the latest note.

**2026-10-11 — Local and live are distinguished by an ignored environment switch.**
`WORKNEST_LOCAL=1` in Git-ignored `app/.env.local` displays a full-page tint/frame and
large `LOCAL DEVELOPMENT` ribbon on every React route. The actual tint and accent
colours are also stored only in the ignored environment file. Vercel receives none of
the variables, so production cannot show the treatment through source deployment
alone. *Rejected:* hostname detection (preview/custom domains drift); a tiny badge;
committing a local colour or permanent development banner.

**2026-10-11 — Page-load choreography varies by route family, never by scroll.**
GSAP gives Tracker/Notes an editorial vertical sequence, Resources/Favourites soft
depth, Admin/Profile lateral console panels, workflow pages alternating compact motion,
and document routes a quiet settle. Every family begins above the resting position and
proceeds in reading order. Work Logs keeps its dedicated date-card sequence without a
second generic animation. Reduced-motion shows everything immediately. *Rejected:* one
animation everywhere; a whole-page "popup"; scroll-linked/observer animation; layout-property animation.

**2026-10-11 — Mobile navigation is capped at five labelled destinations.**
At phone widths, Work Logs, Tickets (when enabled), Tracker, Notes and Resources stay in
the bottom dock; Favourites remains reachable from the floating account menu. The shell
reserves dock + safe-area clearance, and the Admin page uses compact two-column totals,
a bounded account directory, a non-collapsing identity header and full-width actions.
This follows the ui-ux-pro-max five-item bottom-nav limit while keeping labels and 44px+
targets. *Rejected:* six 11px labels squeezed across 320px; icon-only navigation;
horizontal page scrolling; hiding Favourites entirely.

**2026-10-11 — Admin account management is explicit, server-guarded and confirmation-heavy.**
`User.role` defaults to User; `/admin` calls `requireAdmin()` before every cross-account
read/mutation. Admins may reset another account's password, erase its entire workspace,
or delete it; destructive calls require the exact target email, self account deletion /
reset are blocked, and the last Admin cannot be deleted. Password changes/resets bump
`authVersion`, so every old JWT stops authenticating. Whole-workspace erasure is the one
explicit exception to append-only history. *Rejected:* per-history-row admin editing;
revealing/generated passwords; client-trusted roles; silent one-click deletion;
impersonation; keeping old sessions alive after a password reset.

**2026-10-11 — WorkNest is installable, but its service worker never caches private pages.**
The owner wanted a mobile web app install option. The account menu now uses the native
Chromium prompt when available and gives Add-to-Home-Screen steps on iOS/other browsers;
the manifest starts the standalone app at Tracker. The service worker caches only a
static offline screen and its icon, so a shared phone cannot reopen a stale signed-in
workspace from the WorkNest cache. *Rejected:* offline-caching authenticated pages
(privacy and stale-data risk); an install button that works only in Chromium.

**2026-10-11 — Teal & Ink app-wide, one page header, one fluid type scale.**
Owner: Favourites to their screenshot, Tickets "which suits my site", every page right
at mobile/tablet/desktop, "some fonts are too big, some too small". Page titles ranged
30 / 44 / 64 / 72px across pages and the leftover slate band + sky accent clashed with
the teal pages. Now: `PageHead` (+ `SearchPill`, `UnderlineTabs`, pill classes) on every
list page; `.page-title` 32→56px everywhere (Work Logs' `.wl-title` matches); the
`.app-shell` palette itself is Teal & Ink (so document pages, dialogs and MUI match);
text floor 12px; inputs 16px on phones (iOS zoom); shared controls have 44px phone
targets. The hero count shrank on phones (150→80px) — the mockup size swallowed half
the screen. Auth form headings use 32px on phone/tablet. *Rejected:* restyling `PageBand`
per page (keeps two header systems); dropping the Tracker hero size on desktop (it's the
mockup's signature). Tickets: underline status tabs replace the dropdown; list before
the ticket on phones; the viewport-fit (`.wl-fit`) is gone — the list sticks instead.

**2026-10-10 — Resources follows the owner's screenshot in the same family.**
Underline type tabs replace the facet sidebar (with an "All types" menu so a long type
list stays reachable), open two-column cards replace the bordered masonry. Edit/delete
weren't in the screenshot; they sit beside the star and appear on hover from md. Card
initials come from the title (a ≤2-letter first word as-is, else first letters of two
words). *Rejected:* dropping edit/delete from cards (no other way in).

**2026-10-10 — Tracker and Notes use layout "F" from the owner's redesign canvas.**
Owner picked "F" (Tracker To-do / Follow-ups / Notes artboards, then a Notes screenshot)
and asked for it "same how it's there in F". Both pages drop `PageBand` and the list+panel
split: title + pills + search, a summary column with one huge count, a numbered queue (or
the bookshelf). Colours reuse the Work Logs deck tokens (`.wl-deck, .tk-focus`) instead of
the mockup's near-identical hexes, so the two pages match each other. Choices the mockup
didn't spell out: an entry opens in a dialog at every width (no detail panel); "Got it"
closes a follow-up; "Mark nudged" appends a "Nudged" update and clears the nudge date;
follow-ups that replied get a "Your turn" group; a new note is title + tags only (text
goes in as updates); the notes tag-filter row and *Group by tag* were dropped (tag chips
on rows search `#tag`). *Rejected:* keeping the right-hand detail panel (not in the
mockup); exact mockup hexes as a third palette.

**2026-10-09 — AI summary + title regenerate in the background when you leave the editor, only if the content changed.**
Owner: generate the title too, in the background after closing the log, and next time
only if something was added; the summary should cover tickets, work done, to-dos,
follow-ups and notes, not meetings. A `sendBeacon` on unmount/`pagehide` hits a route
handler that answers 202 and works in `after()`; `aiInputHash` (SHA-256 of the AI's input
text) skips unchanged logs, so it costs nothing to reopen a log. The AI only retitles a
default or AI-written title (`titleGenerated`); a typed title is the user's. *Rejected:*
regenerating on every autosave (cost, churn); comparing `updatedAt` (misses child-row and
Tracker changes); one JSON call for title + summary (free models break JSON more often).

**2026-10-09 — Work Logs is the "sprint deck" from the owner's mockup, with its own palette.**
The owner supplied a pixel mockup ("same to same"): day columns that open into the day,
a quick-log bar, teal/ink colours. The palette is scoped to `.wl-deck` so the rest of the
app stays Slate & Sky. Selection is client state (all of the sprint's logs are loaded) so
the column grow can animate; `?day=` is mirrored with `replaceState`. Not built from the
mockup: the bottom dock nav and ⌘K "Jump to a day or ticket" search (shell-wide; search
doesn't exist), meeting times (no field) and "Siddharth to action" owner chips (no data).
*Rejected:* server-rendered selection via links (no animation); `PageBand` on this page.

**2026-10-09 — Navigation is a bottom dock; no top bar. Work Logs shows the current sprint
only, and the day card is Summary · To-dos · Follow-ups · Notes.** Owner: the page didn't
fit the screen, "remove the nav bar from top" (then the brand/account row too), current
sprint only, and the card should show the summary plus the Tracker's three lists for that
day. Tickets, meetings and work done moved off the card (View full log has them). The
account menu sits at the dock's end (opens upwards); on phones it floats top-right so the
six labels fit. *Rejected:* keeping a slim top row for brand + account (owner removed it).
Follow-up the same day: the counts line became a "Jump to a day or ticket" search, the
quick-log bar was removed (so Quick log currently has no button anywhere), empty card
sections are hidden, and the card's date/actions share one row with smaller type.

**2026-10-09 — No shadows or tinted boxes on the page; Tracker rebuilt as list + panel.**
The owner rejected the Tracker (band on top of the old pill strip, underlined tabs and
pastel kanban — three styles on one page) and asked to "remove bg box shadows and all".
In-page shadow tokens are `none` in `.app-shell`; panels and inner boxes are white with
`--c-border`. Floating layers (menus, toasts, dialogs) keep `--sh-md`/`--sh-lg` so they
don't blend into the page. Tracker now follows Work Logs/Tickets: tabs as pills in the
band, list panel left, detail panel right (Needs you by default; the entry or new-item
form inline from `lg`, a dialog below it). Follow-up rows lost the Got reply / Close
quick buttons (both live in the panel). *Rejected:* keeping the kanban; the horizontal
Needs-you pill strip; removing shadows from menus/dialogs too.

**2026-10-09 — The nav is sections + account only; Quick log lives in the Work Logs header.**
Owner asked to remove the date and the Quick log button from the bar. Quick log keeps an
entry point as a band button on Work Logs (`QuickLogButton variant="band"`). Every list
page uses the shared slate `PageBand`; band fields are MUI (`tone="band"`).

**2026-10-08 — Workspace palette is Slate & Sky; white page; visible borders; dark slate top bar.**
The owner reviewed a redesign canvas (18 palettes) and picked Slate & Sky: chrome
`#1e293b`, accent sky `#0369a1` (white 5.9:1), text `#0f172a`, page `#ffffff`, borders
`#94a3b8` ("borders dark so sections are clearly visible"; no grey boxes behind
sections). The top bar is dark slate with the current section as a white pill; primary
buttons are the sky accent (was ink). Status hues unchanged. The page-by-page layout
redesign (kanban Tracker, timeline Work logs, …) follows on branch
`feat/slate-sky-redesign`. *Rejected:* Emerald and 16 other palettes; the white header
with blue underline (2026-10-03).

**2026-10-08 — Quick log: choose a type → paste → review → apply; AI drafts, code matches, nothing saved before Apply.**
The owner wanted to paste one end-of-day dump and have the log, tickets and follow-ups
created or updated. On free `openrouter/free` models (any free model per request) exact
data is unreliable, so the AI only splits text into JSON; code resolves ticket keys
(`1233` → `ASU-1233`, ambiguity → picker), meeting cards, people and channels; the user
reviews every row. Same-day re-apply appends instead of overwriting the one
`TicketWorkUpdate` per log. To-dos fall back to one per line when AI is unavailable
(a deliberate, labelled exception to "AI only"). Follow-ups found in a work log are
unticked suggestions. *Rejected:* a chatbot (multi-turn context on random free models,
more calls, mistakes hidden in replies); letting the AI write directly; overwriting
same-day text on re-apply.
2026-10-08 follow-up: the first real run (free model) used the heading "For Asu meeting"
as the notes and missed that one heading named two meetings. Fix: the prompt now
defines headings, shows one worked example (small models copy examples better than
rules), and a **Use template** button gives the text headings the model reads reliably.

**2026-10-07 — Tracker opens with concrete work needing attention, not a count sentence.**
The owner wanted to see what to do immediately. The first card now combines overdue/today
to-dos with replies to answer and follow-ups due for a nudge; rows open directly and group
links lead to the full lists. Each group previews four rows to keep the page balanced.
Notes remain out because they have no due/action state.

**2026-10-07 — Work-log To-dos lead the detail side rail and both groups count as AI-summary content.**
The owner wanted the day-specific Tracker context visible before attachments instead of after
the main timeline. Completed-that-day and overdue/not-done items are both sent to OpenRouter;
either group can now trigger summary generation even when the log has no other written content.

**2026-10-04 — Phone type scale steps up one notch; 16px phone gutter; 16px form fields.**
User asked for the whole site to read well on phones. An audit of every page at 360/375px found
no sideways scrolling but 11–14px body text, 12px page gutters, fields under 16px (iOS zooms on
focus) and 20–28px tap targets. Fix is global, not per page: the type scale moved to a separate
non-inline `@theme` block and `@media (width < 48rem)` raises 2xs→md by one step; fields get
`--text-lg` (16px) there; main/nav gutter `px-4`; `.tap-area` for text-like controls.
*Rejected:* scaling the root font-size (also grows spacing and breaks fitted layouts);
per-component font classes (hundreds of call sites).

**2026-10-04 — One colour for note block headings; darker topic dividers.** The user tried a different colour per block (Definition blue, Example orange…) and asked for the Definition blue everywhere instead; the faint 1px `--c-border` line between topics was too light to tell topics apart, now 2px `--c-border-strong`. *Rejected:* per-block colours (`data-tone`).

**2026-10-04 — Note jumps use our own frame-by-frame scroll, and lazy pages wait for it to land.**
A 228-page imported notebook made topic jumps stutter (~10fps: every page flown past mounted a
TipTap editor, and the whole reader re-rendered for each heading crossed) and land off target
(pages mounting after a native smooth scroll moved the heading; the old fix re-aimed with a
visible snap). `smooth-scroll.ts` re-reads the target each frame, sets `isJumping()` so
NoteViewer/PageEditor skip mounting mid-flight (they mount on `NOTE_SCROLL_END`), and holds the
target until it stops moving. The reader's page column is memoised and its active-heading
tracking pauses mid-jump. The editor now lazy-mounts each page's editor near the viewport.
*Rejected:* native `scrollTo({behavior:"smooth"})` + re-aim (snaps); mounting everything up front
(edit page unusable at 200+ pages).

**2026-10-03 — Homepage: one section per scroll via native CSS snapping (final, after three tries).**
User wants each scroll to move exactly one section, without waiting. Tried in order: CSS
mandatory snap (felt jerky — mostly the ~30 always-running loops and repainted art, since fixed:
off-screen loops paused, animated art layer-promoted), a JS pager (locked between glides — "I
need to wait"), free scrolling (not one-per-section). Now `scroll-snap-type: y mandatory` +
`scroll-snap-stop: always` on desktop (≥900×560): the browser blends snapping with trackpad
momentum, so nothing locks. Phones scroll freely. *Rejected:* JS wheel paging (waits); free scroll.

**2026-10-03 — `/banner` retired.** It was an unlinked review route for the old "Quiet Studio"
homepage and the only thing keeping the portfolio components, `banner.css`, GSAP and the old
photos alive. Removed with all of them (code stays in git history). *Rejected:* keeping it.

**2026-10-03 — Ticket status badges are all tinted, told apart by hue.** User found mixed
solid/tinted badges confusing. Every stage is light tint + soft ring + dark label; hues: In
progress blue, Sent to QA orange, Ready for production pink, Released muted ink, Done green.
*Rejected:* the earlier "solid = with you, tinted = with someone else" rule.

**2026-10-03 — The logged-in app uses the homepage palette (supersedes charcoal/teal/navy).**
User: one palette everywhere. `.app-shell` `--c-*` tokens now carry the homepage ink/muted/page
colours and its tones; text and fills use deeper shades of the same hues so everything stays
≥4.5:1 (blue `#4562c9`, pink `#b8395f`, red `#c43e3e`, orange `#9a560f`).
Primary chrome is ink (the homepage's dark pills); accent **blue** (purple was tried first
and rejected the same day — don't bring it back); no tint behind the active nav tab; success stays green (no
green on the homepage, but "done" must read as done). Also remapped: header chrome, work-log
hero fields, MUI theme, icon colours (`--c-ic-*`), note fallback colours. *Rejected:* the raw
pastel tones for text (fail contrast); mixing tones with ink (muddy, esp. pink).

**2026-10-03 — Homepage entrances replay on every arrival, from either direction (reverses
"PortfolioReveal plays once" for `/`).** User: scroll up/down animations weren't consistent —
once-only GSAP reveals, load-only hero keyframes, nothing on the way back up, and a fast flick
could skip a screen. Now `ScreenMotion` marks each `.home-screen` `data-active` when it comes
12% into view (with `data-dir` up/down) and clears it only once under 2% is visible; CSS rises
(or drops) `[data-anim]` items in with a stagger (`--i`) and restarts hero/recap keyframes;
(snapping was briefly removed, then restored — see the one-section decision above). Activation is synchronous
(style flush, no rAF). `PortfolioReveal` was deleted with `/banner`. *Rejected:* JS wheel-hijack
full-page scroller (accessibility, trackpad inertia); per-element once-only reveals.

**2026-10-02 — Homepage keeps two fonts (serif display + Plus Jakarta Sans text).** Tried DM
Serif Display for all text; the user reverted it the same day. *Rejected:* one-typeface page.

**2026-10-03 — AI recap section is a "big headline + centre character" poster.** From the
user's reference: a huge one-line headline over a rule, then a bottom row standing on the
screen edge (the kicker/pill and the two facts were removed 2026-10-03) — two
tilted spines (Notes, Summary) with an "AI" sticker | a 3D male character at the centre over a
purple glow (fades in only — the user rejected hover tilt/zoom/float) | a pitch line + "Start writing" CTA with a
self-drawing squiggle. Character: the user's own full-body 3D render (pink hair, glasses, hoodie,
teal brush strokes behind) at `public/home/recap-avatar.webp`; its cream background was cut out
with a sharp script — near-cream AND warm pixels removed everywhere, so the cool-white sneakers
survive (991×1338 source → 1200px tall WebP, ~180 KB). A Fluent 3D emoji stood in briefly. *Rejected:* tilted
paper cards, gradient aurora/glass cards, white cards, card-less timelines, a three.js robot,
the user's own boy render (they wanted a male adult like the reference).

**2026-10-02 — Banner people are in, drawn with DiceBear Avataaars (supersedes "no people" below).**
The user explicitly wanted the banner's human avatars. No 3D renders exist and none may
be downloaded/invented as photos, so the four are illustrated with `@dicebear/core` +
`@dicebear/collection` (MIT; Avataaars art free for commercial use), generated on the
server — no image files, no runtime network. Display serif switched from Playfair to
DM Serif Display to match the banner's sturdier letterforms. Login/register were first
a copy of the hero; the user wanted them distinct, so they now use an app-preview collage.
Features dropped cards for a people lineup; AI recap became a notes → summary → report flow.

**2026-10-02 — New homepage from the user's "Take it to the next level" banner.**
Serif display (Playfair Display, added just for `/`), word chip + italic connector +
outlined pill, scribble circle, doodles, four colour shapes. The banner's shapes held
3D avatars; we have no such assets and PRD forbids invented people, so the shapes hold
the app's four areas — real avatars can drop into the same shapes if the user supplies
them. Headline adapted to the product: "Keep it / all · in · Let's start / one / place."
The old photo page stays at `/banner`. *Rejected:* stock/AI avatar images.

**2026-10-02 — No AI on resource descriptions (tried and removed the same day).**
An AI pass that wrote/rephrased a new resource's description on first save was built
and then removed at the user's request — they didn't want it. Don't re-add it unless
asked. (The URL was never fetched; that SSRF concern still applies to any future idea.)

**2026-10-02 — AI or nothing: removed every code-built fallback for summaries and reports.**
The user doesn't want rule-built text standing in for AI. No key → the summary card and
Reports page say AI isn't set up (link to Profile) and generate nothing; a failed
request → the reason is shown (`AiFailure` → `AI_FAILURE_MESSAGE`, action error code
`AI_UNAVAILABLE`) and nothing is saved. Rows saved earlier without a `model` were
code-built; they're hidden, not deleted. Supersedes the "entry-built fallback" parts of
the decisions below. *Rejected:* keeping the fallback behind a toggle.

**2026-10-02 — Report clipboard HTML uses literal doc styles (raw hex/pt) — a deliberate token exception.**
`reportToHtml` copies the Google Doc's own inline styles (Arial, 20/14/15/14/11pt, band
`#e6f0fa`) so a paste matches the user's existing reports. It's document content for
the clipboard, not app UI; the on-screen preview still uses tokens. Meetings are kept
out of reports at the user's request (AI may use them as context only).

**2026-10-02 — Reports = the user's own "5-15 Report" doc format, one stored report per sprint.**
Format copied from the user's Google Doc so the output pastes straight in: title + date
line written in code, body (Completed This Week / Problems or Blockers, `###` groups,
bullets) from AI or built from logs. Copy uses `ClipboardItem` with `text/html` (taken
from the rendered TipTap DOM) so Docs keeps headings and bullets. AI output is kept only
if it has both section headings. *Rejected:* per-day lists (the doc groups by
ticket/topic); generating on page load (each AI call spends free quota).

**2026-10-02 — OpenRouter key lives in Profile, encrypted with a key derived from AUTH_SECRET.**
The user wanted to paste the key in the app rather than edit `.env`. Stored with
AES-256-GCM (`lib/secret-box.ts`), only the last 4 characters are ever sent to the
browser, and it's checked against OpenRouter's `/api/v1/key` before saving (only a
401/403 blocks the save; network trouble doesn't). The user's key beats the env key.
*Rejected:* plain-text column (public repo, hosted DB); a separate encryption env var
(one more secret to manage for a single-user app).

**2026-10-02 — Work-log summary: AI via OpenRouter (free models), auto-generated once.**
Reverses the "no AI" call below at the user's request. `openrouter/free` by default
(free models are rate-limited, ~50 req/day without credit, and change often), with the
entry-built summary as the fallback when the key is missing or a call fails — the
button always produces something. Auto-generate fires once, on the first *view* of a
log with content, not on first autosave: autosave runs on every pause, so "first
save" would summarise a half-written log. Regenerate stays manual. Log text is sent to
OpenRouter and the model's provider. *Rejected:* summarising on every save (quota,
noise); a separate AI button next to the built summary.

**2026-10-02 — Work-log summary is assembled from the user's entries and stored on the log.** *(Superseded above for the AI part.)*
The user wanted a summary to read when reopening an old log. PRD keeps AI summaries
out of scope, so `buildWorkLogSummary` rearranges and clips what was typed (never new
prose). Stored in `WorkLog.summary` so it shows instantly; staleness = `updatedAt >
summaryGeneratedAt`, which is why `saveWorkLogSummaryRow` writes `updatedAt` back
unchanged. *Rejected:* Claude-written prose (API key, cost, sends log text out);
compute-on-view without saving.

**2026-10-02 — Resource-type icons: picked in Profile, else guessed from the name.**
Custom types all showed one generic glyph. `UserList.icons` (JSON, ResourceType only)
stores `"library:Name"` from the existing notes icon index (`NoteIconPicker`, new
`align`/`placeholder`/`triggerClassName` props); `components/resources/type-icon.tsx`
resolves picked → regex guess → bookmark and is fed by a React context. Saving an
icon may create the row, so "customised" now means values differ from the defaults
and Reset updates values instead of deleting the row. `ListCard` dropped
`overflow-hidden` so the picker can escape the card. *Rejected:* a curated lucide-only
set (no brand logos in lucide 1.x).

**2026-10-02 — Resources have one Description box.** The user didn't want both
Description and "Notes or details". Non-code types now edit only `description`;
legacy `content` is folded into it on edit (saved back with `content: ""`). Command /
Snippet keep `content` because it *is* the item. *Rejected:* a data migration
rewriting every user's resources.

**2026-10-02 — Note reading view is a continuous, all-open document (`NoteReader`).**
The user asked for topics never to collapse and the section name to stay visible
while reading that section. So: no accordion; one column with every page; a sticky
"section › page" bar driven by an IntersectionObserver over section openers and pages
(`rootMargin -130px` top to clear header + bar; anchors `scroll-mt-32`); a left
sidebar listing all topics with `sticky top-0` section names inside its own scroll
box. Page editors still mount lazily (NoteViewer), so long notes stay fast.
`NoteTableOfContents` was deleted. *Rejected:* exclusive `<details>` accordion
(closed sections); one section per URL (`?section=`) — hid the other topics.

**2026-10-01 — Achievements are their own page, `/achievements`, linked from the
account menu, with their own file table.** First shipped as a Profile section; the
user wanted it in the account dropdown instead and disliked the card design, so it
became a year-grouped timeline page (same day). Not in the primary nav (rarely edited).
Certificates are a separate `AchievementFile` (bytes in Postgres, same 10 MB cap and
download rules as work-log attachments) because `WorkLogAttachment` requires a work
log. Type is free text with fixed form suggestions (no `UserList` kind yet).
*Rejected:* a primary-nav item; a Profile section; reusing `WorkLogAttachment` with a
nullable `workLogId`.

**2026-10-01 — Profile shows one section at a time; list order is drag-and-drop.**
The long all-in-one page was hard to scan. A grouped menu opens one section;
ordered lists use `framer-motion` `Reorder` (same as the Notes editor) with a grip
handle that also takes ↑/↓ for keyboard users. *Rejected:* ↑/↓ buttons on every row
(noisy); a new DnD library (framer-motion already ships `Reorder`).

**2026-10-01 — Dropdown options and tag vocabularies are user lists (`UserList`).**
Channels and resource types became free-text columns (enums can't take user values);
default meetings, projects and tags read the same table. No row = built-in defaults,
so nobody needs a backfill. Removing an option never rewrites records; only tag
*delete/rename* edits items, and says so. *Rejected:* one row per option (ordering +
"customised vs default" get awkward); a shared tag list (user wanted Notes and
Resources separate).

**2026-10-01 — Tracker is three to-do-style tabs; Ideas merged into Notes; follow-up
"replied" is derived.** The single mixed board (four kinds, one form, six groups) was
confusing. Now: To-do / Follow-ups / Notes tabs, each with a one-line add row. A
follow-up's Waiting/Replied state comes from `FollowUpUpdate.fromThem` on the newest
record, so it stays append-only and can't drift. *Rejected:* a stored `replied` status
column (would need its own edit path and could disagree with the history); keeping
`Idea` (user treats ideas and notes as the same thing).

**2026-10-01 — Workspace nav bar is white in the site palette** (charcoal text, navy
labels, teal active underline, teal brand tile). Navy and then charcoal were both
rejected by the user as not matching the pages. Scoped to `.app-header` by re-pointing
`--c-sidebar-*` there, so navy primary buttons are unchanged. Tracker tones were also
pulled back to teal/navy (plus danger red for overdue). *Rejected:* changing
`--c-sidebar` globally (recolours every primary button); dark bars.

**2026-09-30 — Workspace navigation is navy; non-homepage pages use no neutral grey
shades.** The page remains white, while teal/navy-derived surfaces and borders replace
the brief grey treatment across workspace and auth pages. Active navigation uses a
white underline for contrast. The homepage is explicitly unchanged because its
`--pf-*` palette is independently scoped.

**2026-09-30 — Primary navigation is a neutral bar with an active underline
(superseded later the same day by the navy bar).** The
filled sliding capsule was removed. A grey bar separates navigation from the white
page, while a teal underline marks the current section on desktop and mobile.

**2026-09-30 — The workspace uses the complete five-colour palette (superseded later
the same day when neutral grey was removed).** White remains
the page canvas; charcoal is primary text; grey (`#d9d9d9`) now supplies neutral
surfaces and decorative edges; teal marks interactions and functional boundaries;
navy carries strong chrome and accent text. Tints are derived from those colours.

**2026-09-29 — One-command setup: `npm run dev` on a fresh clone does everything.**
`scripts/setup.mjs` (zero deps, runs before `npm install`) is idempotent and runs on
every `npm run dev`, so pulling new migrations or a changed lockfile self-heals. It
seeds **only when the `User` table is empty** because `seed.ts` deletes all users.
The seed's email became `SEED_EMAIL` (setup writes `demo@worknest.local`) so the
public README doesn't publish the owner's address; unset, it still falls back to the
owner's email so the existing `app/.env` behaves as before. Verified on an isolated
fresh copy (separate container/port): 22 s to a seeded DB, sign-in works, re-run skips
everything. *Rejected:* a shell script (not portable to Windows), `prisma migrate dev`
in setup (can prompt/create migrations), auto-seeding a non-empty DB.

**2026-09-29 — Tracker: colour on labels, not on surfaces.** The owner found the
pastel group headers/borders (each tone mixed 10–40% into white) and the teal-tinted
quick-capture bar unattractive. Cards, headers and borders are now neutral; tones stay
on icon tiles, date chips and kind chips. Chip text is deepened with 20% ink because
the red/amber/green tones measured 4.1–4.4:1 on their own tint.

**2026-09-29 — Resources keeps a distinct colour per type.** The layout pass had put
all 10 types on the single teal accent (taste skill "one accent"); the owner preferred
the colour coding and it was restored the same day. The one-accent rule covers UI
chrome only — see Design-System.md §10 rule 1a.

**2026-09-29 — Layout polish pass against taste-skill, ui-ux-pro-max, Vercel
guidelines and Linear's DESIGN.md.** Targeted fixes, not a redesign (redesign skill:
"improve what's there"): palette and fonts kept (Geist + Geist Mono is the taste
skill's own recommended pairing). Dials for the app: variance 5, motion 4, density 7.
Changes: 64px single-line nav; page titles 24→30px / 600 (were 30→36px / 750);
per-level heading tracking; 42 dead `sm:` classes → `md:`; `window.confirm` →
`ConfirmationDialog`; `…` not `...`;
meeting-tab indicator moves by transform. *Rejected:* ui-ux-pro-max's generated system
(Caveat/Quicksand, storytelling pattern, zinc+blue — built for marketing pages);
Phosphor instead of Lucide (taste suggestion, but a swap across every screen for no
functional gain); noise/grain textures (wrong for a dense tool).

**2026-09-29 — Palette switcher tried and removed; the teal/navy/charcoal palette stays.**
Two alternative palettes were trialled the same day under a Profile → "Website
settings" section — **Harbor** (cream `#f2f2ec`, indigo `#2a2548`, sky `#5aa8c4`,
graphite `#57575a`, mustard `#ecbb55`, sage `#bbbda8`) and **Blossom** (blush
`#fff7f6`, ink `#26262f`, coral `#e56a67`, green `#3d8250`, yellow `#f2cf45`, dusty pink
`#e0d6d7`) — as inline `--c-*` overrides on `.app-shell` chosen via a `wn-palette`
cookie. The owner chose to keep the original, and all of it (switcher, section,
cookie handling) was removed. If palettes come back, that token-override approach
worked cleanly; Harbor's sky blue needed deepening to `#2f7f9c` for white button text.
A browser that tried it may still hold a harmless, ignored `wn-palette` cookie.

**2026-09-29 — MUI popups portal into the open dialog.** Dropdowns inside `Modal`
were invisible: MUI portals to `<body>`, below the top-layer `<dialog>`. Theme
defaults in `mui-provider.tsx` now portal `MuiPopper`/`MuiPopover` into the open
`dialog:modal` (fixed strategy so it isn't clipped). Consequence: `Modal`'s backdrop
close now also requires the pointer *press* to start on the backdrop (see Gotchas).
*Rejected:* `disablePortal` per field (lists clipped by the dialog's overflow) and
swapping native `<dialog>` for MUI Dialog (loses the platform focus trap/Escape).

**2026-09-29 — Resources are editable; type + tags are searchable.** Edit reuses the
add form prefilled (`updateResource` already existed). Type is a searchable
Autocomplete; tags use the new `TagInput`, suggesting the user's existing tags
(derived client-side from the loaded resources, no extra request). Tags normalise to
lowercase so "AWS" and "#aws" don't fork.

**2026-09-29 — Project docs consolidated into six root files.** The old `memory/`
folder, `agents/` role files, `.claude/` / `.codex/` / `.agents/` skill bundles,
`app/PRODUCT.md`, `app/DESIGN.md`, `office/` monitor and `skills-lock.json` were
removed by the owner. Replaced by `PRD.md`, `Design-System.md`, `Architecture.md`,
`AGENTS.md` (+ `CLAUDE.md` → `@AGENTS.md`), `Memory.md`, `skills.md`, rebuilt from the
current code. Where old notes disagreed with the code, the code won.

**2026-09-28 — Geist is the app UI face.** Crisp neo-grotesk with real Medium/SemiBold
steps keeps hierarchy at dense 13–14px. Geist Mono for IDs/timestamps/code. Plus
Jakarta Sans stays for public pages only. *Rejected:* keeping Plus Jakarta everywhere.

**2026-09 (late) — Light only; theme toggle removed.** `theme-provider`, `theme-toggle`,
`theme.ts` and the homepage toggle were deleted; viewport is `colorScheme: light`.
Dark token blocks remain in CSS but are dormant. Reintroducing dark mode is a
deliberate project, not a toggle flip.

**2026-09-25 — Dashboard retired; Tracker is home.** `/dashboard` redirects to
`/tracker`; login and signed-in `/login` land on `/tracker`. `lib/dashboard.ts` and
the dashboard card motion were deleted. The Tracker is the thing you check first.

**2026-09-25 — Profile settings are per user.** Sprint start date + length (7/14/21/28)
and a `ticketsEnabled` switch live on `User`. Turning tickets off hides the nav item,
redirects `/tickets`, and hides the editor's Tickets section — data is kept.
Sprint maths take the user's `SprintConfig`; default anchor 2026-09-02, 14 days.

**2026-09-25 — Favourites page.** Aggregates favourite notes, favourite resources
(new `Resource.favorite`) and pinned open Tracker entries. *Rejected:* a generic
polymorphic favourites table — each area already had (or needed) its own flag.

**2026-09-25 — Tracker gets `Idea` kind and `pinned` (shown as "Important").**
Important items form their own group at the top and appear in Favourites.

**2026-09-25 — Work logs gain learning notes and attachments.** `learningNotes`
(Markdown) on `WorkLog`; `WorkLogAttachment` (File | Link). Files are stored in
Postgres (`bytea`, ≤10 MB, ≤10 per upload) so they survive serverless hosting; uploads
use a route handler because server actions cap bodies at 1 MB. `data` is never
selected in list queries. *Rejected:* filesystem storage (lost on Vercel), blob
storage (extra service for a single user).

**2026-09-25 — Work logs have a `dayType` (Work / Holiday / Leave).** Days off account
for the day without meetings/tickets, render hatched in the sprint list, and are
excluded from the ticket journey.

**2026-09-25 — Project / site moved from WorkLog to Ticket.** A project belongs to the
work item, not the day. The migration copied each ticket's most recent log project.
`ProjectInput` autocompletes from the user's existing names. *Supersedes* the
2026-09-23 "work logs carry projectName" decision.

**2026-09-24 — Workspace palette: teal / navy / charcoal (user-supplied).** White page,
white cards with teal-shade borders, tinted fills only for emphasis, navy chrome.
Scoped to `.app-shell` so homepage/auth keep their looks.

**2026-09-24 — MUI for form fields.** Input, Select, Textarea and Autocomplete use MUI,
themed with CSS tokens, in `@layer mui` so Tailwind utilities still win. Ticket search
is a freeSolo Autocomplete. Tiny inline micro-controls stay custom.

**2026-09-24 — Hosting: Vercel + Neon; migrations from a laptop.** Vercel root `app`,
pooled URL at runtime, `db:hosted` runs `migrate deploy` against the direct URL.
Seeds read `SEED_PASSWORD` — never hardcode credentials (public repo).

**2026-09-23 — Standalone ticket updates are a separate, deletable history.**
`/tickets` body updates create `TicketHistoryEntry` rows (status snapshot); they can be
deleted with confirmation. `TicketWorkUpdate` rows are never touched from `/tickets`.
Title/status edits only change the `Ticket` row. *Rejected:* reusing
`saveTicketWorkUpdate` (needs a log id, could overwrite that day's draft); a delete on
every timeline row (would let the page erase work-log history).

**2026-09-23 — Ticket details require an explicit selection.** No auto-selecting the
first ticket; the detail panel loads only after a choice.

**2026-09-19/20 — Homepage is "The Quiet Studio".** Photo-led editorial page with
matched light/dark photo pairs, a 4-link workspace index right after the hero, no
floating product cards. Earlier commit-graph and banner designs remain in source,
unmounted.

**2026-09-14 — Tracker kinds share one table.** Follow-ups, tasks, notes (and later
ideas) share a spine: subject, optional date, append-only record. Wording per kind
lives in `KIND_META`. Models stay named `FollowUp`/`FollowUpUpdate` — a rename is a
migration nobody needs.

**2026-09-14 — Pill nav replaces the sidebar.** Top floating nav matches the
homepage; no collapsed-rail cookie.

**2026-09-14 — Notes are notebooks (Note → Section → Page, TipTap JSON).** Ported from
the Nexa project; notes carry no body themselves.

**2026-09-13 — Five-stage ticket workflow.** In Progress → Sent to QA → Ready for
Production → Released → Done. Legacy statuses stay in the enum for old rows and are
normalised on read (`lib/workflow-status.ts`).

**2026-09-12 — Append-only ticket history enforced structurally.**
`@@unique([ticketId, workLogId])` + upsert: same log = in-place autosave, new log = new
row. No path can clobber yesterday's entry or duplicate on autosave.

**2026-09-12 — Stack.** Next.js App Router + TS + Tailwind 4, Postgres 16 in Docker,
Prisma, Auth.js v5 credentials + bcrypt, Zod. No automated test suite — verification
is done on the real rendered app.

## Gotchas

- **2026-10-15 — Editor uploads can be orphaned.** Files upload while you write (before
  the entry/update exists), so a draft that's never saved — and every upload from a
  Markdown field (Work Logs, Tickets, Resources, Achievements), which is never linked —
  stays a `FollowUpFile` row with `followUpId = null`. Removing it from the text doesn't
  delete the file. They're owner-only and removed with the account (and by the admin
  record erasure), but nothing sweeps them sooner. Linking happens server-side from the
  ids in the saved doc (`docFileIds`), scoped to the user.

- **2026-10-09 — Vercel Preview builds have no `DATABASE_URL`.** `env("DATABASE_URL")` in
  `prisma.config.ts` threw during `postinstall` (`prisma generate`), and the Prisma client
  was created on import, so `next build` failed too. Now the config falls back to `""` and
  `lib/prisma.ts` creates the client lazily on first query. A preview *builds*, but pages
  that query fail until Preview gets its own `DATABASE_URL` (use a Neon branch, never prod).
- **2026-10-09 — A local DB copied from live can't use the live OpenRouter keys.** Profile keys
  are encrypted with the deploy's `AUTH_SECRET`; after copying live → local they don't
  decrypt with the local secret, so AI reports "not configured" locally. Set
  `OPENROUTER_API_KEY` in `app/.env`, or re-save the key in Profile, to test AI locally.
- **Live Neon is Postgres 18, local Docker is 16** — `pg_dump` must be ≥ the server, so dump
  live with the `postgres:18` image (skills.md §11a). Empty migration folders (no
  `migration.sql`) break `migrate deploy`; two such leftovers were moved out on 2026-10-09.
- **Lucide icons ignore `currentColor` inside `.app-shell`** — the global icon-colour
  map (`svg.lucide-star { color: amber }` etc., unlayered) beats Tailwind text
  utilities. On a coloured fill (note covers) set `style={{ color: "inherit" }}` on the
  icon or `[&_svg]:!text-inherit` on its wrapper, or it can vanish into the fill.
- **`sr-only` text inside a horizontal scroller widens the page** unless the scroller
  is `relative` — the absolutely positioned text escapes `overflow-x-auto` (Tracker's
  Needs-you strip, 2026-10-08).
- **A `<dialog>` rendered outside `.app-shell` gets the old teal palette** — the
  workspace `--c-*` tokens are scoped to `.app-shell`. Mount providers that render
  dialogs inside it (Quick log does).
- **`grep` in this shell is `ugrep`** and an unquoted `--include=*.tsx` makes zsh abort the
  command ("no matches found") — counts silently come out 0. Quote globs or use `/usr/bin/grep`.
- **Run `npm run typecheck` from the repo root** (or `npm --prefix app run typecheck`). Before
  2026-10-03 the app had no `typecheck` script, so running it inside `app/` silently did nothing.
- **Hero lines overlap.** `.home-title` has `line-height: 0.8` and "one" is pulled up under the
  chip row, so line 3 covered the "Let's start" pill (text cursor, dead clicks). Line 2 is
  `position: relative; z-index: 1` — keep it above the others.
- **`filter: drop-shadow` + `mask-image` on the same element draws a faint box** around it in
  Chrome (seen on the register avatar). Don't combine them on cut-out art.
- **Don't test homepage scroll motion in a hidden browser pane.** Hidden tabs throttle
  IntersectionObserver and pause rAF, so screens look "stuck hidden" there but not in a
  visible window. Also: an element edge-adjacent to the viewport reports `isIntersecting` true
  with ratio 0 — `ScreenMotion` treats <2% as gone for that reason.
- **The recap screen is pinned to `height: 100dvh` (desktop snap only).** Its bottom row
  sizes to the leftover height (`.rc-center { height: 100% }`) so the character's feet are never
  cropped on short windows; with only `min-height` the percentages had nothing to resolve against.
- **`proxy.ts` redirects unknown static file types to `/login`.** Its matcher only skips
  listed extensions; a `.glb` model came back as the login HTML (GLTFLoader: "Unexpected
  token '<'"). Add any new public asset extension there. Manifest, service worker and
  offline paths are explicit exceptions.
- **Bump `VERSION` in `public/sw.js` when its precached offline page or icon changes.**
  Activation removes older WorkNest caches; without a new name, an existing install can
  keep the older precached response.
- **Homepage must zero `scroll-padding-top`.** `globals.css` pads anchors 96px for the app
  nav; on the snapping homepage that made every full-height screen land 96px low and clip
  its bottom. `home.css` resets it inside the one-viewport media query.
- **One-viewport snapped screens are gated on window size** (`min-width: 900px` and
  `min-height: 560px`); below that, screens flow at their natural height and scroll freely —
  mandatory snapping with a section taller than the viewport would trap content. If you add content to a screen, re-check it still fits ~1000×600 (the user's
  laptop window) — the recap screen is pinned to `100dvh`.

- **`openrouter/free` in Profile → Model picks a random free model each call** — including
  tiny ones (`liquid/lfm-2.5-2.6b:free` wrote a report) and "thinking" ones that run out of
  tokens. Most "didn't return a usable answer" errors come from that. Leave Model empty
  (Gemma 31B first) or name a specific model.

- **Free reasoning models can return their thinking as the answer.** `openrouter/free`
  picked one that replied "Here's a thinking process…" and got cut off. Hence
  `reasoning: { exclude: true }`, the finish-reason/length/leak checks in
  `lib/ai-summary.ts`, and a non-reasoning default model.

- **Rotating `AUTH_SECRET` breaks saved OpenRouter keys.** They're sealed with a key
  derived from it; afterwards `open()` returns null, AI counts as not set up, and the Profile → Account AI summaries card asks the user to re-enter the key.

- **Note page headings are offset when rendered.** `buildNoteExtensions({ headingOffset })`
  renders a level-1 heading as `h4` in the reader / `h3` in the editor so the page
  outline stays valid. Stored JSON is unchanged (levels 1–3). Style note headings by
  `[data-level]`, never by `h1`/`h2` tag inside `.note-prose`.

- **Effect cleanups must UNDO, not force-finish.** React dev StrictMode runs effects
  mount → cleanup → mount; the scroll-reveal cleanup once force-revealed every pending
  item, so below-the-fold content popped in at load (dev only). Cleanup now resets
  pending items to "unseen" so the second run re-decides.
- **Testing motion in the built-in browser pane:** when the pane is hidden the page
  composites no frames, so CSS animations and IntersectionObserver freeze (opacity
  stuck at 0). Re-open/screenshot the pane before judging an animation bug.

- **The icon colour map is unlayered CSS, so it beats Tailwind `text-*` on an SVG.**
  An icon that must follow its parent's colour (solid fills, checkbox ticks hidden
  with `text-transparent`) needs an entry in the exception rule in `globals.css`.

- **`prisma migrate diff` turns an enum→text change into DROP COLUMN + ADD COLUMN**
  (data loss). Write it as `ALTER COLUMN … TYPE TEXT USING col::text` by hand — see
  `20261001020000_user_lists`.
- **`lib/user-lists.ts` must not import `lib/tickets.ts`** (tickets → worklogs →
  user-lists would cycle); it queries ticket project names itself.

- **MUI multiline padding doubled.** `OutlinedInput` pads both the multiline root and
  the `<textarea>`, so every Textarea was indented ~28px. Fixed in `mui-provider.tsx`
  with `multiline: { "& textarea": { padding: 0 } }` — MUI v7 has no
  `inputMultiline` override key (typecheck fails) and no such class on the element.
- **Work-log to-dos are filtered in the browser.** "Completed that day" needs the
  user's local day, which the server doesn't know; the server returns a ±1-day window
  (`listTodosAroundDay`) and `DayTodos` narrows it after hydration.

- **“Work done” is stored in `WorkLog.learningNotes`.** The field/component names are
  legacy internals from when the UI called this section “Learning & upskilling”.
- **Name nested Tailwind groups.** The previous-sprints `<details>` wrapper once used
  the same unnamed `group` as its log cards, so hovering anywhere in the expanded
  disclosure activated every card's ticket preview. Use a named group for container
  state when descendants have independent hover/focus group states.
- **Tracker = `FollowUp`.** Looking for a `Tracker` model? It's `FollowUp` /
  `FollowUpUpdate` in `lib/follow-ups.ts` and `actions/follow-ups.ts`.
- **`--c-sidebar-*` means navy chrome**, not a sidebar (there isn't one).
- **No `sm:` / `2xl:` breakpoints.** Only `xs md lg xl`.
- **`Menu` must not close on `button[type=submit]`** — closing unmounts the
  `<form action>` before it submits.
- **Clicks inside a dialog can target the dialog itself.** If a press and release
  land on different elements (press a Select, release on its menu option), the
  browser fires `click` on their common ancestor — now the `<dialog>`, since menus
  portal into it. That looked like a backdrop click and closed the popup; `Modal`
  therefore tracks where the pointer press started.
- **MUI 9 freeSolo Autocomplete:** Enter commits the *typed* text even when an
  option is auto-highlighted. Use click or ↓+Enter to pick; don't rely on
  `autoHighlight` in freeSolo fields.
- **`sm:` classes do nothing here** (breakpoints are `xs md lg xl`) — they fail
  silently. 42 of them (Profile, Favourites, Notes editor, ticket card) were converted
  to `md:` on 2026-09-29; e.g. the Notes editor toolbar had been hidden on desktop.
  Grep for `sm:` after adding UI.
- **The nav is 64px (4rem).** `.tickets-board` height and sticky asides (`top-20`) are
  computed from it — change them together.
- **Server actions cap bodies at 1 MB** — file uploads go through
  `/api/work-logs/[id]/attachments`.
- **`ProjectInput` has no module-level cache on purpose** — module state survives
  client-side sign-out/in and would leak one account's project names to the next.
- **`auth()` throws on an undecryptable cookie** (e.g. after changing `AUTH_SECRET`).
  `getCurrentUser` treats it as signed out and `proxy.ts` clears the cookie.
- **Prisma 7:** URL lives in `prisma.config.ts`; the CLI doesn't auto-load `.env`
  (dotenv is imported there); the client is gitignored so `postinstall` must run
  `prisma generate`; a driver adapter (`@prisma/adapter-pg`) is required.
- **Dates:** `WorkLog.date` is UTC midnight; sprints and Tracker "today" are local
  days. Two copies of sprint maths once disagreed by a day — only use `getSprint`.
- **Postgres is on host port 5434** (5432/5433 are used by other projects).
- **LAN dev origin** `192.168.31.130` is hard-coded in `next.config.ts` for testing
  from another device; update it if the IP changes.
- **Default meeting cards** (ASU / Veritech / Client Sync-up) are hard-coded in
  `lib/worklogs.ts`. Legacy autogenerated `Others` rows remain stored but are filtered
  from work-log reads so removing the UI did not destroy existing notes.
- **Seed scripts** default to the owner's account (`DEFAULT_EMAIL` in each script) and
  some replace that account's data — ask first.
- **`next dev` may re-create `app/AGENTS.md`** with a Next.js "read the docs" block.
  That's harmless; the guidance is already in the root `AGENTS.md`.

## Changelog

`YYYY-MM-DD — what changed — key files`

- 2026-10-15 — Tags lose their fill: coloured text only (owner: solid and pastel capsules both looked off) — `components/ui/tag-chip.tsx`, `lib/tag-colors.ts`, `components/resources/resource-library.tsx`, `components/tracker/tracker-board.tsx`

- 2026-10-15 — Work log detail redesigned from the owner's mockup (dark hero band with title + counts, log left, to-dos/history/details right); Resources type list on a dark panel and solid tag capsules (owner: no pastels) — `app/(app)/work-logs/[workLogId]/page.tsx`, `components/resources/resource-library.tsx`, `components/ui/tag-chip.tsx`, `lib/tag-colors.ts`, docs

- 2026-10-15 — Live /tracker 500 after deploy: `tracker_rich_updates` hadn't been applied to Neon; ran `db:hosted` (migrate deploy). Reminder: hosted migration before merging schema changes (skills.md §11 step 6) — Neon

- 2026-10-15 — Full editor (links, image/file upload, Markdown paste) in every large text field: `MarkdownEditor` upgraded, Resource + Achievement descriptions switched to it and render formatted; Notes add buttons tinted — `components/work-log/markdown-editor.tsx`, `components/ui/editor-uploads.ts`, `components/resources/resource-library.tsx`, `components/achievements/achievements-board.tsx`, `app/(app)/favourites/page.tsx`, `lib/rich-text.ts`, `components/notes/NoteForm.tsx`, `components/notes/SectionEditor.tsx`, `app/globals.css`

- 2026-10-15 — Delete on every Tracker row; header/composer popups no longer hidden under the columns (stacking fix, also fixes "Clear date"); coloured tag capsules (Resources sidebar + rows, Tracker notes); Resources type list on a card with a tinted current type — `components/tracker/tracker-board.tsx`, `components/resources/resource-library.tsx`, `components/ui/tag-chip.tsx`, `lib/tag-colors.ts`

- 2026-10-15 — Tracker rich editor (full toolbar inside the field, formatted/Markdown paste, image + file uploads ≤4 MB), optional note date (default today), to-dos first in Today; migration `tracker_rich_updates` (`FollowUpUpdate.doc`, `FollowUpFile`) — `components/tracker/update-editor.tsx`, `lib/rich-text.ts`, `lib/follow-ups.ts`, `lib/validation.ts`, `lib/admin.ts`, `app/api/tracker-files/**`, `components/tracker/tracker-board.tsx`, `app/globals.css`, `prisma/schema.prisma`

- 2026-10-14 — Resources redesigned from the owner's mockup: Type/Tags side column, one sortable list of rows with initials tiles, underline search; sanity pass (typecheck, lint, build) and stale doc lines fixed — `components/resources/resource-library.tsx`, `PRD.md`, `Design-System.md`, `Memory.md`

- 2026-10-14 — Tracker: formatting toolbar moved inside the text field (dialog + note composer), dialog Status/Added/Due values aligned on one row, note rows show the title only (owner reversed "latest update on the card" for notes) — `components/tracker/tracker-board.tsx`, `components/tracker/note-text.tsx`, docs

- 2026-10-14 — Tracker reworked to the owner's second mockup: two columns per tab, add field beside the title, tabs + search on the top line, status eyebrows on rows; side column removed — `components/tracker/tracker-board.tsx`, `app/globals.css`, docs

- 2026-10-14 — Tracker redesign from the owner's mockup (side glance column, Today/Upcoming buckets, collapsed finished groups, round ticks, underline add field), note composer with formatting, latest message on rows, two-column entry dialog; Resources All tab and same-name type merge/guard — `components/tracker/tracker-board.tsx`, `components/tracker/note-text.tsx`, `components/resources/resource-library.tsx`, `lib/resource-types.ts`, `lib/user-lists.ts`, `components/profile/list-editors.tsx`, `components/ui/modal.tsx`, `app/globals.css`

- 2026-10-14 — Aligned Tracker tabs with Tickets, removed oversized row indices, labelled the latest follow-up reply inline, defaulted new follow-ups to Slack and today's reminder date, clarified that the date means when to follow up again, and replaced the Who datalist with a searchable free-text autocomplete — `components/tracker/tracker-board.tsx`, docs

- 2026-10-14 — Changed the full-width navbar from slate to a darker deep teal while retaining its white active underline and high-contrast labels — `app/globals.css`, `Design-System.md`

- 2026-10-14 — Repacked Work Log detail into independent columns with To-dos first on the right while preserving Ticket history, and restored Blocked as a selectable/filterable ticket status — `work-logs/[workLogId]/page.tsx`, `components/{tickets/ticket-board,ui/ticket-status-badge}.tsx`, `lib/workflow-status.ts`, docs

- 2026-10-14 — Added standalone ticket creation at the top of Tickets, compressed the ticket journey, and surfaced the newest history item above the update form — `components/tickets/ticket-board.tsx`, `actions/tickets.ts`, `lib/{tickets,validation}.ts`, docs

- 2026-10-14 — Moved the authenticated nav from the bottom dock to a centred full-width top bar with a white active underline, added direct editing for a ticket's number/title/project with duplicate-number protection, gave the selected ticket row a teal highlight, and fixed long Work Log to-do titles so they wrap inside their card — `components/shell/{app-nav,app-shell}.tsx`, `components/tickets/ticket-board.tsx`, `components/work-log/day-todos.tsx`, `actions/tickets.ts`, `lib/{tickets,validation}.ts`, `app/globals.css`, docs

- 2026-10-12 — Rebuilt Tracker as a full-width grouped record: removed the decorative stats column, surfaced latest notes, kept completed/closed/archived items visible by date, removed the repeated Resources type heading, and let Work Log to-do titles wrap — `components/tracker/tracker-board.tsx`, `components/resources/resource-library.tsx`, `components/work-log/day-todos.tsx`, docs

- 2026-10-11 — Added an unmistakable full-page local tint/frame and large environment ribbon; its switch and actual colours live only in Git-ignored `app/.env.local` and remain absent from Vercel — `app/src/app/layout.tsx`, `app/.env.local` (ignored)
- 2026-10-11 — Added GSAP route-family page-load choreography (editorial, library, console, workflow and document variants), kept Work Logs' bespoke calendar sequence, scrolling static and reduced-motion safe — `app/package.json`, `app/package-lock.json`, `components/shell/{page-motion,app-shell}.tsx`, `components/shell/scroll-reveal.tsx` (deleted), `app/globals.css`
- 2026-10-11 — Fixed anonymous homepage cards at narrow phone widths: feature-preview rows now shrink/ellipsis instead of forcing a 360px grid track, AI recap cards stay inside 320px, and login/register remained overflow-free — `app/src/app/(marketing)/home.css`, `app/src/components/home/feature-showcase.tsx`
- 2026-10-11 — Reinitialized the local Git repository for `git@github.com:stingo-36/WorkNest.git`; working files were preserved and nothing was staged, committed or pushed — `.git`, `Memory.md`
- 2026-10-11 — Re-audited mobile typography across public, authenticated and source-backed detail/editor pages; aligned Work Logs/auth headings, reduced Tracker/Notes display metrics, and made shared controls, Profile switches/list editors and recurring actions at least 44px on phones — `app/globals.css`, `app/(auth)/auth-motion.css`, `components/ui/{button,password-field,toast}.tsx`, `components/{auth,work-log,profile,resources,shell}/*`, `app/(app)/work-logs/[workLogId]/page.tsx`
- 2026-10-11 — Fixed phone responsiveness: five-item bottom dock with safe-area/content clearance, Favourites in the mobile account menu, adaptive Profile section select, smaller fluid headings and controls, and compact non-overflowing Admin cards/header/actions — `components/shell/{app-nav,app-shell,page-head}.tsx`, `components/profile/profile-form.tsx`, `components/admin/admin-dashboard.tsx`, `app/globals.css`
- 2026-10-11 — Added persisted User/Admin roles and a server-guarded, read-only admin dashboard with system totals and per-account WorkNest statistics; migration `user_roles` — `prisma/schema.prisma`, `prisma/migrations/20261011093412_user_roles`, `lib/admin.ts`, `app/(app)/admin/page.tsx`, `lib/user-settings.ts`, `components/shell/app-nav.tsx`
- 2026-10-11 — Rebuilt Admin as an interactive account operations console; added admin password reset, record/account deletion with typed-email confirmation, self-service password change, global session revocation via `authVersion`, and role-aware post-login routing; migration `account_session_version` — `components/admin/admin-dashboard.tsx`, `actions/{admin,auth,profile}.ts`, `lib/{admin,account-security,auth,session}.ts`, `components/profile/password-settings.tsx`, `prisma/*`
- 2026-10-11 — Made WorkNest installable on mobile/desktop: manifest + branded icons, iOS metadata, service-worker registration with a private-data-safe offline screen, and an account-menu install option with native Chromium prompt / Add-to-Home-Screen instructions — `app/manifest.ts`, `public/{sw.js,offline.html,icons/*}`, `components/pwa/*`, `components/{providers,shell/app-nav,shell/app-shell}.tsx`, `next.config.ts`, `proxy.ts`
- 2026-10-11 — Favourites rebuilt from the owner's screenshot; Tickets in the shared style; `PageHead` on every list page (PageBand retired); Teal & Ink app-wide; fluid type scale; 12px text floor, 16px inputs on phones; small tap targets fixed; responsive-design skill installed — `components/shell/page-head.tsx`, `app/(app)/favourites/page.tsx`, `components/tickets/ticket-board.tsx`, `app/globals.css`, `components/ui/mui-provider.tsx`, profile / achievements / reports / tracker / notes / resources components
- 2026-10-10 — Resources rebuilt from the owner's screenshot (title + search + Add, underline type tabs + All types, tag row, two-column open cards) — `components/resources/resource-library.tsx`, `app/globals.css`
- 2026-10-10 — Tracker and Notes list rebuilt as layout "F" (summary column + numbered queue / bookshelf, `.tk-focus` styles) — `components/tracker/tracker-board.tsx`, `components/notes/NoteLibrary.tsx`, `app/(app)/notes/page.tsx`, `app/globals.css`
- 2026-10-09 — PR #5 merged; migration `worklog_ai_title` applied to live (`db:hosted`, owner-approved) — live schema up to date

- 2026-10-09 — Builds no longer need a database: `prisma.config.ts` tolerates a missing `DATABASE_URL`, Prisma client created lazily (fixes the failing Vercel Preview build) — `app/prisma.config.ts`, `app/src/lib/prisma.ts`

- 2026-10-09 — Background AI summary + title on leaving the editor (only when content changed); summary input now tickets, work done, the day's to-dos/follow-ups/notes (no meetings); migration `worklog_ai_title` (`aiInputHash`, `titleGenerated`) — `app/api/work-logs/[workLogId]/ai-refresh/route.ts`, `lib/{worklogs,worklog-summary,ai-summary,day-tracker}.ts`, `components/work-log/work-log-editor.tsx`, `actions/worklog.ts`, `lib/validation.ts`, `app/(app)/work-logs/page.tsx`

- 2026-10-09 — Pushed local work-log data to live (owner-approved): sahiltari36@gmail.com 6 Oct (title, meeting notes, ticket update) and 7 Oct (new log), tickets 25917 + 26057; one transaction of id-upserts after a live backup and a dry run; work logs now identical on both — procedure in skills.md §11b

- 2026-10-09 — Work Logs: counts line → day/ticket search (`components/work-log/deck-search.tsx`), quick-log bar removed (`QuickLogBar` deleted), empty day-card sections hidden, card header on one row with tighter type — `app/(app)/work-logs/page.tsx`, `components/work-log/{sprint-deck,open-day-bar}.tsx`, `app/globals.css`

- 2026-10-09 — Nav moved to a floating bottom dock (top bar removed, account menu in the dock / top-right on phones); Work Logs fits the screen, current sprint only, day card = Summary + day's Tracker to-dos / follow-ups / notes (`listTrackerForRange`) — `components/shell/{app-nav,app-shell,menu}.tsx`, `components/work-log/sprint-deck.tsx`, `app/(app)/work-logs/page.tsx`, `actions/follow-ups.ts`, `lib/follow-ups.ts`, `lib/validation.ts`, `app/globals.css`

- 2026-10-09 — Work Logs rebuilt as the sprint deck (animated day columns → day card, quick-log bar, previous-sprint links); Quick log `open(kind, text)` pre-fills the paste step; `OpenDayBar` replaced by `QuickLogBar` — `app/(app)/work-logs/page.tsx`, `components/work-log/{sprint-deck,open-day-bar}.tsx`, `components/quick-log/quick-log.tsx`, `app/globals.css`, PRD §5.1

- 2026-10-09 — Tracker rebuilt as band tabs + list panel + detail panel (Needs you default; entry/new form inline from lg); page shadows and tinted boxes removed app-wide (borders instead) — `components/tracker/tracker-board.tsx`, `app/globals.css`, `app/(app)/work-logs/page.tsx`, `components/tickets/ticket-board.tsx`, `components/work-log/attachments-section.tsx`, `components/reports/report-view.tsx`, `components/resources/resource-library.tsx`, `components/work-log/create-day-tile.tsx`, PRD §5.3

- 2026-10-09 — Shared `PageBand` header on Tracker/Notes/Resources/Favourites/Profile/Achievements/Reports; nav date + Quick log removed; MUI band fields (`tone="band"`); Work Logs day chips (replace the segment bar) and previous sprints folded behind a toggle; card borders removed on Work Logs/Tickets — `components/shell/{page-band,app-nav,app-shell}.tsx`, `components/ui/{band-sx.ts,input.tsx,select.tsx}`, `components/quick-log/quick-log.tsx`, pages, docs

- 2026-10-09 — Work Logs fits the viewport (`.wl-fit`), slate buttons, ticket/meeting cards; Tickets rebuilt to match (band + list + ticket, viewport-fit from lg; old `.tickets-board` CSS removed); Notes books open in 3D on hover (`.book-3d`) — `app/(app)/work-logs/page.tsx`, `components/tickets/ticket-board.tsx`, `components/notes/NoteLibrary.tsx`, `app/globals.css`, PRD §5.1/§5.2/§5.4

- 2026-10-09 — Local DB replaced with a copy of live (6 users, 64 logs); Work Logs band now uses the nav's own tokens (one slate block, nav-style buttons), page Quick log removed, title beside the date — `app/(app)/work-logs/page.tsx`, `components/work-log/open-day-bar.tsx`, `app/globals.css`, skills.md §11a

- 2026-10-09 — Work Logs page rebuilt as "Option B": header band joined to the nav (`.wl-band`, deep sky `--c-primary-active`), day list + selected-day preview via `?day=`; `OpenDayBar` / `EmptyDayActions` replace the create form and timeline here — `app/(app)/work-logs/page.tsx`, `components/work-log/open-day-bar.tsx`, `app/globals.css`, PRD §5.1

- 2026-10-09 — Notebook covers get icon art (large faded icon + dot texture); Tickets table and drawer split into two separate cards — `components/notes/NoteLibrary.tsx`, `components/tickets/ticket-board.tsx`, PRD §5.2/§5.4

- 2026-10-08 — Work Logs create form: removed the Title field (set in the editor instead) — `components/work-log/create-work-log-form.tsx`

- 2026-10-08 — Work Logs: removed the sprint jump list; the timeline takes the full width — `app/(app)/work-logs/page.tsx`, PRD §5.1

- 2026-10-08 — Reports: sprint card rail (replaces the select) and a paper-on-desk preview with one toolbar — `components/reports/report-view.tsx`, PRD §5.9

- 2026-10-08 — Achievements: totals strip, year pills, centred rail with alternating cards from lg — `components/achievements/achievements-board.tsx`, PRD §5.8

- 2026-10-08 — Profile redesign: identity header, horizontal grouped tab bar (was a left rail), settings rows — `components/profile/profile-form.tsx`, PRD §5.7

- 2026-10-08 — Resources: light type facets, tag facets in the sidebar (search `#tag`), plain panel header, masonry cards — `components/resources/resource-library.tsx`, PRD §5.5

- 2026-10-08 — Note reader: white contents panel, slate/sky active states, right "On this page" rail at xl — `components/notes/NoteReader.tsx`, PRD §5.4

- 2026-10-08 — Notes list redesign: bookshelf of accent-coloured covers (replaces the library index) — `components/notes/NoteLibrary.tsx`, `app/(app)/notes/page.tsx`, PRD §5.4

- 2026-10-08 — Favourites redesign: bento grid (intro tile, slate Important tile, note and resource tiles) — `app/(app)/favourites/page.tsx`, PRD §5.6

- 2026-10-08 — Tickets redesign: toolbar with status stacked bar, table + detail drawer (viewport-fit from xl, was lg); list cards and mobile picker removed — `components/tickets/ticket-board.tsx`, `app/globals.css`, PRD §5.2

- 2026-10-08 — Work-log detail redesign: dark details panel (`.wl-hero` tokens retinted to sky) + bento of cards — `app/(app)/work-logs/[workLogId]/page.tsx`, `app/globals.css`, PRD §5.1

- 2026-10-08 — Work-log editor redesign: action strip + one-document layout (`.wl-doc` flattens section cards into ruled chapters) + right margin (On this page, to-dos); attachments moved into the document — `components/work-log/work-log-editor.tsx`, `app/globals.css`, PRD §5.1

- 2026-10-08 — Work Logs listing redesign: split hero (form + slate sprint card with progress ring) and a vertical per-sprint timeline with a sprint jump list; `CreateDayTile` gains a `row` variant — `app/(app)/work-logs/page.tsx`, `components/work-log/create-day-tile.tsx`, PRD §5.1

- 2026-10-08 — Tracker redesign: Needs-you pill strip, underlined tabs, search in the header, To-do kanban (4 columns), Follow-ups as 2 board columns, Notes masonry, add forms on the right — `components/tracker/tracker-board.tsx`, PRD §5.3

- 2026-10-08 — Slate & Sky palette for the workspace: white page, darker borders, dark slate top bar with white-pill active section, sky primary buttons — `app/globals.css`, `components/shell/app-nav.tsx`, `components/ui/button.tsx`, docs

- 2026-10-08 — Quick log: prompt explains headings + worked example; work-log **Use template** (day's meetings, open tickets, Work done); blank template sections dropped — `lib/quick-log.ts`, `actions/quick-log.ts`, `components/quick-log/quick-log.tsx`, docs
- 2026-10-08 — Added Quick log (paste text → AI draft → review → apply) for work logs, to-dos and follow-ups, with a nav button and a Work Logs header button — `lib/quick-log.ts`, `actions/quick-log.ts`, `components/quick-log/*`, `lib/tickets.ts` (`findTicketsByKeyHint`), `lib/ai-summary.ts` (`checkReasoning`), `lib/validation.ts`, `components/shell/{app-shell,app-nav}.tsx`, docs

- 2026-10-07 — Replaced Tracker's small Needs you count line with a first-class action section listing overdue/today to-dos, replies to answer and due nudges, with direct item and full-list access — `components/tracker/tracker-board.tsx`, docs

- 2026-10-07 — Moved the work-log detail To-dos card to the top of the right rail before Attachments; ensured completed and overdue/not-done to-dos both make the day eligible for AI summary generation — `work-logs/[workLogId]/page.tsx`, `components/work-log/{day-todos,work-log-summary}.tsx`, `lib/worklog-summary.ts`, docs

- 2026-10-04 — Mobile pass across the site: phone type scale +1 step, 16px fields (no iOS zoom), 16px gutters, larger tap targets (`.tap-area`, resource icon buttons); audited every page at 360/375px — `globals.css`, `shell/app-shell.tsx`, `shell/app-nav.tsx`, `notes/NoteReader.tsx`, `notes/NoteForm.tsx`, `tracker/tracker-board.tsx`, `work-log/*`, `resources/resource-library.tsx`

- 2026-10-04 — Notes: level-2 page headings shown as tinted accent bands (sections of a topic easy to spot); edit page *At a glance* scrolls on its own; smooth, snap-free topic jumps in reader and editor (frame-by-frame chase, lazy mounts paused mid-jump, height estimates for unmounted pages, memoised reader column, lazy page editors); block headings all use one blue band (per-block colours tried and dropped the same day), topic dividers and `hr` darkened to 2px `--c-border-strong` — `globals.css`, `components/notes/{smooth-scroll,doc-height}.ts`, `NoteReader.tsx`, `NoteViewer.tsx`, `NoteForm.tsx`, `PageEditor.tsx`

- 2026-10-03 — Homepage nav/footer links renamed to Workspace · AI summaries · Get started with matching anchors (`#workspace`, `#ai-summaries`, `#get-started`; verified each lands on its screen); docs audit: Memory snapshot rewritten, stale gotcha removed, Architecture layout fixed (23 migrations); removed dead `app/scripts/generate-banner-scene.py` and unused `images.qualities` in `next.config.ts` — `components/home/home-page.tsx`, `next.config.ts`, docs
- 2026-10-03 — Homepage one-section-per-scroll restored with native snapping (`snap-stop: always`), now without the animation load that made it jerky — `(marketing)/home.css`
- 2026-10-03 — Homepage back to free native scrolling: JS pager removed (it made you wait between scrolls), no snapping; perf fixes kept — `components/home/home-page.tsx`, `(marketing)/home.css`
- 2026-10-03 — Homepage scrolling smoothed: CSS scroll-snap replaced by an eased one-screen-per-gesture pager (wheel, keys, anchors; momentum swallowed); off-screen loops paused; animated art layer-promoted — `components/home/screen-pager.tsx`, `components/home/home-page.tsx`, `(marketing)/home.css`
- 2026-10-03 — Cleanup + sanity pass: removed unused code (19 never-imported files incl. `components/marketing/*`, `components/banner/*`, `ui/card`, `ui/priority-indicator`, `skiper40`; the `/banner` route + `components/portfolio/*` + `public/Images`; ~565 lines of dead CSS; 4 unused fonts; 20 unused exports; packages `gsap`, `@gsap/react`, `zeed-dom`; create-next-app SVGs); `typecheck` now runs `next typegen` first (it failed on a fresh clone); `.env.example` AI comment corrected; README updated (features, no-Docker setup, config, troubleshooting); verified a fresh copy installs, lints and builds — `app/src/**`, `app/package.json`, `package.json`, `README.md`, docs
- 2026-10-03 — Ticket status badges unified: all light tint + ring + dark label (no solid fills), one hue per stage — In progress blue, Sent to QA orange, Ready for production pink, Released muted ink, Done green; timeline pill matches — `components/ui/ticket-status-badge.tsx`, `components/tickets/ticket-board.tsx`, `app/globals.css`
- 2026-10-03 — Workspace accent switched purple → homepage blue (`#4562c9`; statuses/tracker re-toned: ready-for-prod & upcoming/waiting orange, replied pink); active nav tab no longer tinted — `app/globals.css`, `components/ui/mui-provider.tsx`, `lib/note-colors.ts`
- 2026-10-03 — Workspace recoloured to the homepage palette (tokens, header, work-log hero, MUI, icon colours, note fallbacks) — `app/globals.css`, `components/ui/mui-provider.tsx`, `lib/note-colors.ts`
- 2026-10-03 — Removed the unused DiceBear avatars (`person.tsx`, `people.ts`, `@dicebear/*`, `.person*` CSS, `Shape*` backdrops); hero entrance reordered (all four characters together first, headline lines next, doodles popping in at scattered `--dd` delays throughout, orange ring drawn last); auth avatar static with no shadow (fixes a grey box from drop-shadow + mask); "Let's start" fully clickable (the "one" line overlapped it) — `app/package.json`, `app/brand-art.css`, `components/home/doodles.tsx`, `(marketing)/home.css`, `(auth)/auth-motion.css`
- 2026-10-03 — Hero's four DiceBear people replaced by the user's 3D characters on brush strokes (already transparent; split into `public/home/hero-1…4.webp`), resized for landscape art; DiceBear `person`/`people` now unused — `components/home/home-page.tsx`, `(marketing)/home.css`
- 2026-10-03 — Auth panels re-tinted to match the character art (login pinks, register blue–violets; were lavender/peach and clashed); register figure's hard trouser cut faded with a mask — `(auth)/auth-motion.css`
- 2026-10-03 — Auth art swapped for the user's newer render (bean bag + laptop on login, clipboard on register, with brush strokes), same cut-out process — `public/home/auth-login.webp`, `public/home/auth-register.webp`
- 2026-10-03 — Login/register panels use the user's 3D character (split from one render, white background flood-filled out so the mug/clipboard survive): laptop + coffee on login, clipboard on register — `components/auth/auth-shell.tsx`, `(auth)/auth-motion.css`, `public/home/auth-login.webp`, `public/home/auth-register.webp`
- 2026-10-03 — Homepage scroll motion unified: every screen replays its entrance on arrival (rise when scrolling down, drop when scrolling up), hero/recap keyframes restart, one flick = one screen (`scroll-snap-stop`); GSAP `Reveal` removed from `/` — `components/home/screen-motion.tsx`, `components/home/home-page.tsx`, `components/home/feature-showcase.tsx`, `(marketing)/home.css`
- 2026-10-03 — Recap: shoes no longer cropped (screen pinned to 100dvh, stage sizes to the space left); avatar hover tilt/zoom/float/breathe removed (fade-in only); kicker + facts row removed — `(marketing)/home.css`, `components/home/recap-avatar.tsx`, `components/home/home-page.tsx`
- 2026-10-03 — Recap centre character is now the user's full-body 3D render (cream background removed, WebP with alpha, ~180 KB); stage resized for a portrait figure — `public/home/recap-avatar.webp`, `components/home/recap-avatar.tsx`, `(marketing)/home.css`
- 2026-10-03 — Recap redone as the reference poster layout (headline + rule, facts, spines | centre 3D man | pitch + CTA); boy image removed; Fluent 3D "Man technologist" stand-in — `components/home/home-page.tsx`, `components/home/recap-avatar.tsx`, `public/home/recap-avatar.png`, `(marketing)/home.css`
- 2026-10-03 — Recap character: user's 3D render added (`public/home/recap-avatar.webp`) in an arch frame with float, breathe and cursor tilt; full-body version pending from the user — `components/home/recap-avatar.tsx`, `(marketing)/home.css`
- 2026-10-03 — Recap: robot and three.js removed; image slot for a user-supplied 3D character (`public/home/recap-avatar.png`, hidden while missing, floats in the arch) — `components/home/recap-avatar.tsx`, `components/home/home-page.tsx`, `(marketing)/home.css`, `package.json`, `src/proxy.ts`
- 2026-10-02 — Recap avatar is now a live 3D robot: three.js (lazy-loaded), idles, waves on first view, thumbs-up on click, follows the cursor, pauses off-screen, static under reduced motion; `glb` allowed through the proxy — `components/home/robot-stage.tsx`, `public/home/robot.glb`, `src/proxy.ts`, `package.json`, `(marketing)/home.css`
- 2026-10-02 — Recap rebuilt as tilted step spines + large cropped avatar + AI sticker (old timeline/card CSS removed); fixed a tablet rule an earlier edit had mangled (`.fs` single column under 900px) — `components/home/home-page.tsx`, `(marketing)/home.css`
- 2026-10-02 — Recap redesigned: two columns (heading + avatar with floating tags | vertical timeline), content trimmed to three lines per step, Copy button removed, fewer doodles (hidden on phones) — `components/home/home-page.tsx`, `(marketing)/home.css`
- 2026-10-02 — Recap: new generic sample content (TCK-214/219, client call, staging blocker); doodles now scattered across the whole section (`.rc-doodles`/`.rc-dd-*`) instead of a head cluster. How it works rewritten product-wide (not sprint-only): "Save it once, use it anytime." — Save it / Find it / Use it, mentions notes, resources, achievements — `components/home/home-page.tsx`, `(marketing)/home.css`
- 2026-10-02 — Features: richer gradient, tighter number column, 5 animated doodles per area (new marks in `doodles.tsx`); AI recap rebuilt as a card-less timeline with doodle art in place of the side copy (`.rc-*`, no gradients, generic content, old `.home-flow*`/`.home-sample*` removed); one-font experiment reverted — `(marketing)/home.css`, `components/home/home-page.tsx`, `components/home/feature-showcase.tsx`, `components/home/doodles.tsx`
- 2026-10-02 — Features polish: autoplay 4s (`CYCLE_MS`, also drives the progress bar via `--fs-cycle`); full-screen backdrop is a diagonal wash from the tone into a neighbour (`--tone-2`) + drifting glow, new area fades in from a slight zoom; numbers enlarged, baseline-aligned and grow with the active title; preview type scaled up; darker `--h-muted` in the section for contrast; previews use generic sample content (no real tickets/people) — `(marketing)/home.css`, `components/home/feature-showcase.tsx`
- 2026-10-02 — Features: on desktop the area tint fills the whole screen (`.fs-backdrop`, one layer per area, cross-faded) and the preview panel goes clear; active tab title grows, inactive ones shrink; homepage `scroll-padding-top: 0` so snapped screens aren't clipped — `(marketing)/home.css`, `components/home/feature-showcase.tsx`
- 2026-10-02 — Hero "Let's start" pill nudged down (`translate: 0 0.8cqi`) so it centres in the gap between "Keep it" and "one"; reset on mobile — `(marketing)/home.css`
- 2026-10-02 — Features: title full width on one line; showcase always auto-plays (click jumps, cycle continues; off under reduced motion via `useSyncExternalStore`); previews are content laid on the tinted panel with line-by-line entry + a faint area doodle (no cards) — `components/home/feature-showcase.tsx`, `(marketing)/home.css`

- 2026-10-02 — Hero: removed the intro line; chip/"in"/button row centred; on snapped screens the art spans full width with people pinned to the corners (height-sized) and the headline sized by viewport height — `home-page.tsx`, `(marketing)/home.css`

- 2026-10-02 — Homepage: one-viewport snapped screens (hero / features / recap / how+CTA+footer), features became a tab + live-preview showcase (no repeated avatars), centred coloured steps, type-scale tokens, tighter hero chip row; login/register: no cards, fit one screen, person + statement panel — `components/home/feature-showcase.tsx`, `home-page.tsx`, `(marketing)/home.css`, `auth/auth-shell.tsx`, `(auth)/auth-motion.css`

- 2026-10-02 — Homepage v2: DiceBear people in shapes, DM Serif Display, banner-measured hero stage, features lineup, AI recap flow, coloured step numbers, tighter sizing/wider content; login/register redesigned (card + app-preview collage panel) — `components/home/{people.ts,person.tsx,home-page.tsx}`, `app/brand-art.css`, `(marketing)/home.css`, `components/auth/auth-shell.tsx`, `(auth)/auth-motion.css`, `app/layout.tsx`, `package.json` (+@dicebear/core, @dicebear/collection)

- 2026-10-02 — Homepage redesigned to the "Next Level" banner style (serif hero, chip/pill, doodles, colour shapes, Features/AI recap/How it works/CTA); Playfair Display added; `PortfolioReveal` now plays once and fades from below; earlier spacing/type polish on `banner.css` (now `/banner` only) — `components/home/*`, `(marketing)/home.css`, `(marketing)/page.tsx`, `app/layout.tsx`, `portfolio/portfolio-reveal.tsx`, `banner/banner.css`

- 2026-10-02 — AI robustness: separate `cut_off` failure, model named in error messages, one automatic retry on cut-off/bad replies, report headings normalised (bold / `#` / "Problems/Blockers"), report token budget 8000 — `lib/ai-summary.ts`, `lib/reports.ts`, `actions/reports.ts`, `actions/worklog.ts`

- 2026-10-02 — Removed the AI resource-description feature (user didn't want it) — deleted `lib/resource-description.ts`; reverted `actions/content.ts`, `resources/resource-library.tsx`, `lib/validation.ts`

- 2026-10-02 — Resources: AI writes/rephrases a new resource's description once after first save (toast, Undo on rephrase) — `lib/resource-description.ts`, `actions/content.ts`, `resources/resource-library.tsx`

- 2026-10-02 — Summaries and 5-15 reports are AI-only: no code-built fallback; clear messages when AI is off or fails; old code-built rows hidden; new `AI_UNAVAILABLE` error code — `lib/ai-summary.ts`, `lib/worklogs.ts`, `lib/worklog-summary.ts`, `lib/reports.ts`, `lib/result.ts`, `actions/worklog.ts`, `actions/reports.ts`, `work-log-summary.tsx`, `report-view.tsx`, `profile/ai-settings.tsx`

- 2026-10-02 — Reports: copy moved onto the report as a bar with "Copy for Google Docs" and "Copy as plain text" — `components/reports/report-view.tsx`

- 2026-10-02 — Reports: no meetings group; preview + copy now match the Google Doc layout (centred title/date, section bands, bold groups) via `report-format.ts` — `components/reports/*`, `lib/reports.ts`

- 2026-10-02 — Reports page (account menu): per-sprint "5-15 Report" in the user's doc format, AI or built, stored, rich copy for Google Docs; new `SprintReport` model; shared `openRouterComplete`; in-word underscores kept when stripping Markdown — `lib/reports.ts`, `actions/reports.ts`, `components/reports/report-view.tsx`, `reports/page.tsx`, `shell/app-nav.tsx`, migration `20261002075312_sprint_reports`

- 2026-10-02 — Summaries switched from a prose paragraph to headingless bullet points (one per thing done), built and AI — `lib/worklog-summary.ts`, `lib/ai-summary.ts`

- 2026-10-02 — Summaries are now a short prose paragraph (no Tickets/Meetings/To-dos sections) for both the built and AI versions; duplicate same-named to-dos collapsed — `lib/worklog-summary.ts`, `lib/ai-summary.ts`, `lib/worklogs.ts`

- 2026-10-02 — Work-log summaries (AI and built) now include the day's to-dos: completed that day + overdue/not done; the client sends `getTimezoneOffset()` so the split matches the To-dos card — `lib/worklogs.ts`, `lib/worklog-summary.ts`, `lib/ai-summary.ts`, `work-log-summary.tsx`

- 2026-10-02 — `db:seed:fill` now tops up empty auto-created logs (blank meetings + ticket work) instead of skipping them; filled tariboi36's current sprint — `prisma/seed-fill.ts`

- 2026-10-02 — New `db:seed:achievements` seeder (7 achievements, re-runnable); seeded tariboi36 across all sections — `prisma/seed-achievements.ts`, `package.json`

- 2026-10-02 — AI summaries shortened (≤60 words, 2–4 bullets); replies that are cut off, too long or leaked reasoning are discarded (fallback to entry-built); default model now free Gemma before `openrouter/free` — `lib/ai-summary.ts`, `lib/ai-settings.ts`

- 2026-10-02 — Profile → Account → AI summaries card (moved in from its own menu item the same day): save/replace/remove an OpenRouter key (encrypted) and model list; summaries use it before the env key — `components/profile/ai-settings.tsx`, `lib/ai-settings.ts`, `lib/secret-box.ts`, `actions/profile.ts`, migration `20261002071747_user_openrouter_key`

- 2026-10-02 — Work-log summary now AI-written via OpenRouter (free models, entry-built fallback), auto-generated once on first view; new `WorkLog.summaryModel`; `OPENROUTER_*` env — `lib/ai-summary.ts`, `lib/worklog-summary.ts`, `lib/worklogs.ts`, `components/work-log/work-log-summary.tsx`, migration `20261002071422_work_log_summary_model`

- 2026-10-02 — Heading/spacing audit of every app page (rendered DOM): one h1 per page, no skipped levels, all font sizes/weights on the scale. Fixed: notes list rows h2; note reader desktop h1 (sidebar title); note content headings shifted (`headingOffset`: reader 3, editor 2; CSS by `data-level`); resources empty state h2 + card/command titles h3; page-header gap unified to 24px; string descriptions as `<p>` — `notes/editor-extensions.ts`, `NoteViewer.tsx`, `RichTextEditor.tsx`, `NoteReader.tsx`, `NoteLibrary.tsx`, `resource-library.tsx`, `shell/page-header.tsx`, `tracker-board.tsx`, `(app)/work-logs/page.tsx`, `globals.css`

- 2026-10-02 — Work-log detail: removed the stats row (tickets / meetings / projects / attachments) and compacted the navy header — `work-logs/[workLogId]/page.tsx`

- 2026-10-02 — Work-log Summary card on the detail page (Generate / Regenerate, stale note), new `WorkLog.summary` + `summaryGeneratedAt` — `lib/worklog-summary.ts`, `lib/worklogs.ts`, `actions/worklog.ts`, `components/work-log/work-log-summary.tsx`, `work-logs/[workLogId]/page.tsx`, migration `20261002070020_work_log_summary`

- 2026-10-02 — Resources search: word-by-word AND match over title/description/content/URL/type/tags, `#` ignored, spaces ≡ dashes — `resources/resource-library.tsx`

- 2026-10-02 — Work Logs fits one viewport: create form compacted (small navy today badge + one row Date · Day type · Title · button at xl; was a full-height navy panel + stacked fields), tighter page/timeline spacing, day tiles min-h-28; icon picker panel flips above its trigger when there's no room below — `work-log/create-work-log-form.tsx`, `(app)/work-logs/page.tsx`, `work-log/create-day-tile.tsx`, `notes/NoteIconPicker.tsx`

- 2026-10-02 — Notes list as a searchable library index (no cards); reader: scroll-measured current page, smooth re-aimed jumps, solid sticky bar with Star/Edit/Trash, neutral sidebar states; resource-type icons (Profile picker + name guesses, bare icons), one Description box for resources, Delete-all tags, no row numbers in Profile lists — `notes/NoteLibrary.tsx`, `notes/NoteReader.tsx`, `(app)/notes/page.tsx`, `resources/type-icon.tsx`, `resources/resource-library.tsx`, `profile/list-editors.tsx`, `notes/NoteIconPicker.tsx`, `lib/user-lists.ts`, `actions/user-lists.ts`, migration `20261001190050_resource_type_icons`

- 2026-10-02 — Note typography unified: `.note-prose` on tokens only (body 15, in-page h1/h2/h3 18/16/15, tables 14, code 13 Geist Mono, weight 600 — was 15.5px/650 and em-based headings that out-sized the topic title); reader topic number inside its heading — `globals.css`, `notes/NoteReader.tsx`, `Design-System.md` §5

- 2026-10-02 — Notes redesign: list cards as notebook covers (contents preview, section/page counts, no navy stats band); note view rebuilt as `NoteReader` — all sections/pages open, sticky section › page bar, left sidebar with every topic (pinned section names); `NoteTableOfContents` removed — `(app)/notes/page.tsx`, `(app)/notes/[noteId]/page.tsx`, `notes/NoteReader.tsx`, `lib/note-store.ts` + `lib/notes.ts` (`pageCount`)

- 2026-10-01 — Achievements moved out of Profile to `/achievements` (account menu) and redesigned as a year-grouped timeline — `(app)/achievements/page.tsx`, `components/achievements/achievements-board.tsx`, `shell/app-nav.tsx`, `profile-form.tsx`, `profile/page.tsx`
- 2026-10-01 — Profile → Achievements (certifications/courses/awards with certificate uploads) + imported the two AWS certifications (with PDFs) from Itadori for sahiltari36@gmail.com — `Achievement`/`AchievementFile` + migration `20261001181510_achievements`, `lib/achievements.ts`, `actions/achievements.ts`, `api/achievements/[achievementId]/files`, `api/achievement-files/[fileId]`, `components/profile/achievements-section.tsx`, `profile-form.tsx`, `profile/page.tsx`
- 2026-10-02 — Data only: imported the Itadori brain dump "Cloudflare Quick Tunnel – General Steps" (nid 150) as note "Cloudflare Quick Tunnel" (1 section, pages General Steps + DDEV Example split on its two h1s) for sahiltari36@gmail.com; one-off script, not kept
- 2026-10-01 — Data only: imported Itadori Drupal notebooks as new local notes for sahiltari36@gmail.com — "JavaScript Roadmap" (nid 12; 6 sections/32 pages), "MERN Stack - Express" (nid 127; 8/28), "MERN Stack - MongoDB" (nid 144; 8/22); CKEditor HTML → TipTap via `generateJSON` + `buildNoteExtensions`; one-off script, not kept — no code changes
- 2026-10-01 — One-shot scroll reveals across the app (`data-reveal` / `data-reveal-stagger`, IntersectionObserver controller in the shell) and a branded 404 page — `shell/scroll-reveal.tsx`, `shell/app-shell.tsx`, `app/not-found.tsx`, `globals.css`, page/list components

- 2026-10-01 — Every Lucide icon coloured by meaning via one CSS map on `lucide-<name>` classes (11 `--c-ic-*` tokens), with exceptions for solid fills and checkbox ticks — `globals.css`, `Design-System.md`

- 2026-10-01 — Palette pass to fix the per-page ratings: palette-only ticket statuses (fill style distinguishes stages), navy anchors on Tickets/Notes/Resources/Favourites, Resources rainbow removed, stronger active nav link, palette fallback accents, coloured "original" tag icons, soft teal position badges, Tickets opens the first ticket — `globals.css`, `ticket-status-badge.tsx`, `ticket-board.tsx`, `notes/page.tsx`, `resource-library.tsx`, `favourites/page.tsx`, `app-nav.tsx`, `note-colors.ts`, `ui/tag-icon.tsx`, `list-editors.tsx`

- 2026-10-01 — Profile: one-section-at-a-time grouped menu (`?section=`), navy section header bands, drag-to-reorder lists, full-strength row controls; Tracker follow-up rows show the latest message body, darker list headings — `profile-form.tsx`, `list-editors.tsx`, `(app)/profile/page.tsx`, `tracker-board.tsx`

- 2026-10-01 — Hierarchy pass on Tracker + Profile: "Needs you" status line, focus (Overdue/Today/They replied) vs quiet lists, always-live CTAs, recessed composers, merged Profile header, 30→18→14 type ladder, quiet row controls; `PageHeader` description accepts ReactNode + text-balance/pretty — `tracker-board.tsx`, `profile-form.tsx`, `list-editors.tsx`, `shell/page-header.tsx`, `Design-System.md`

- 2026-10-01 — Redesigned Profile (identity strip, section rail, sticky save bar) and added editable dropdown lists (channels, resource types, default meetings, projects) and separate Notes/Resources tag management (add/rename/delete); channel + resource type are now free text (migration `20261001020000_user_lists`) — `profile-form.tsx`, `profile/list-editors.tsx`, `lib/user-lists.ts`, `actions/user-lists.ts`, `tracker-board.tsx`, `resource-library.tsx`, `lib/worklogs.ts`, `actions/tickets.ts`, `lib/validation.ts`, seeds

- 2026-10-01 — Tracker: long titles truncate with hover text, dark active tab, note tags (filter + group by tag, migration `20261001010000_tracker_note_tags`); work log editor and view show the day's completed/overdue to-dos; fixed doubled textarea padding app-wide — `tracker-board.tsx`, `work-log/day-todos.tsx`, `work-log-editor.tsx`, `work-logs/[workLogId]/{page,edit/page}.tsx`, `lib/follow-ups.ts`, `actions/follow-ups.ts`, `lib/validation.ts`, `schema.prisma`, `ui/mui-provider.tsx`, `seed-tracker.ts`

- 2026-10-01 — Added `--append` to `db:seed:tracker` (adds a separate dummy set without wiping) and used it on tariboi36@gmail.com — `prisma/seed-tracker.ts`, `Architecture.md`

- 2026-10-01 — Tracker now full page width with form cards for Notes (Title + Content) and Follow-ups; tracker tones and nav bar moved onto the teal/navy/white palette — `tracker-board.tsx`, `globals.css`, `app-nav.tsx`, `Design-System.md`
- 2026-10-01 — Redesigned the Tracker into To-do / Follow-ups / Notes tabs with inline add rows; merged Ideas into Notes; follow-ups track Waiting vs They replied via `FollowUpUpdate.fromThem` (migration `20261001000000_tracker_notes_and_replies`); nav bar recoloured charcoal — `tracker/tracker-board.tsx`, `(app)/tracker/page.tsx`, `lib/follow-ups.ts`, `lib/validation.ts`, `schema.prisma`, `seed-tracker.ts`, `favourites/page.tsx`, `globals.css`

- 2026-09-30 — Made the workspace nav navy and replaced grey workspace/auth surfaces, text tiers and borders with teal/navy shades; homepage untouched — `globals.css`, `(auth)/auth-motion.css`, `shell/app-nav.tsx`, `resources/resource-library.tsx`, `Design-System.md`
- 2026-09-30 — Renamed the Work Log Learning & upskilling section to Work done across editing, summaries, timelines and copied text — `learning-section.tsx`, `work-log-editor.tsx`, `work-logs/[workLogId]/page.tsx`, `PRD.md`
- 2026-09-30 — Removed the default Others meeting from new logs and hid the legacy autogenerated card without deleting stored notes — `lib/worklogs.ts`, `meeting-section.tsx`, `PRD.md`, `Architecture.md`
- 2026-09-30 — Replaced the selected navigation capsule with a teal underline and gave the nav bar a neutral grey background — `shell/app-nav.tsx`, `globals.css`, `Design-System.md`
- 2026-09-30 — Rebalanced workspace tokens across the full charcoal/teal/white/grey/navy palette while keeping the page background white — `globals.css`, `Design-System.md`
- 2026-09-30 — Existing work-log tiles now open the read-only timeline instead of the editor; create-day tiles still open the editor — `work-logs/page.tsx`, `PRD.md`
- 2026-09-30 — Scoped the previous-sprints disclosure group so hovering it no longer opens every work-log card's ticket preview — `work-logs/page.tsx`
- 2026-09-29 — README with one-command setup (`npm run dev` / `npm run setup`), `SEED_EMAIL`, app/README points to root; fixed root `npm run typecheck` (ran tsc from the repo root with no tsconfig, printing help) — `README.md`, `scripts/setup.mjs`, `package.json`, `app/.env.example`, `app/prisma/seed.ts`, `app/README.md`
- 2026-09-29 — Tracker: neutral group cards/headers and quick-capture bar, quieter chips with AA text — `tracker/tracker-board.tsx`
- 2026-09-29 — Restored per-type colours on Resources — `resources/resource-library.tsx`

- 2026-09-29 — Layout polish: single-line 64px nav, calmer page titles, heading tracking, `sm:`→`md:` fixes, confirm dialogs, day-type toggle fits on phones, transform-based tab indicator; installed design skills — `shell/app-nav.tsx`, `shell/page-header.tsx`, `globals.css`, `resources/resource-library.tsx`, `work-log/meeting-section.tsx`, `work-log/day-type-toggle.tsx`, notes/profile/favourites files, `.claude/skills/`

- 2026-09-29 — Removed the palette switcher and Website settings section; original palette only — `actions/profile.ts`, `lib/validation.ts`, `(app)/layout.tsx`, `(app)/profile/page.tsx`, `shell/app-shell.tsx`, `profile/profile-form.tsx` (deleted `components/theme/`, `profile/website-settings.tsx`)
- 2026-09-29 — Trialled a palette switch (Harbor / Blossom) under Profile → Website settings; MUI popups outside dialogs now portal into `.app-shell` (kept) — `ui/mui-provider.tsx`

- 2026-09-29 — Fixed invisible MUI dropdowns inside popups (Resources type, Tracker "Where") and the resulting backdrop false-close — `components/ui/mui-provider.tsx`, `components/ui/modal.tsx`
- 2026-09-29 — Resources: edit button + prefilled edit form, searchable type dropdown, `TagInput` tag autocomplete — `components/resources/resource-library.tsx`, `components/ui/tag-input.tsx`
- 2026-09-29 — Added 6 AI/design resources (Taste Skill, MCP Market, Web Design Guidelines, Awesome DESIGN.md, UI Skills, Context7) to the sahiltari36 account in the local DB — data only

- 2026-09-29 — Created PRD.md, Design-System.md, Architecture.md, AGENTS.md (+ CLAUDE.md import), Memory.md, skills.md from the current codebase — repo root
- 2026-09-28 — App UI font switched to Geist / Geist Mono — `src/app/layout.tsx`, `globals.css`
- 2026-09-25→28 — Theme toggle removed (light only); dashboard retired → `/tracker`; Favourites page; Profile settings (sprint, tickets toggle); resource favourites; Tracker Idea + Important; work-log day type, learning notes, attachments; project name moved to tickets — `prisma/migrations/20260925*`, `actions/profile.ts`, `components/work-log/*`, `app/(app)/favourites`, `app/api/*`
- 2026-09-25 — `db:seed:sprint`, `db:seed:tracker`, `db:seed:workspace` added — `app/prisma/seed-*.ts`
- 2026-09-25 — Vercel/Neon deploy prep logged (`9a9d6a7`)
- 2026-09-24 — `db:hosted` helper for the hosted DB (`ee4ee09`); repo pushed to GitHub (`0f13d26`); seeds read `SEED_PASSWORD`
- 2026-09-23 — `/tickets` live with standalone history entries; work-log project name (later moved to tickets)
- 2026-09-19/20 — Homepage "Quiet Studio" redesign; auth pages diverged
- 2026-09-14 — Tracker, Notes notebooks, pill navigation
- 2026-09-11/12 — Initial schema, auth, work-log editor with append-only ticket updates
