# Design System — WorkNest

> **How it looks.** The single source of truth for values is the CSS, not this file:
> `app/src/app/globals.css` (app + auth), `app/src/app/(marketing)/home.css` (homepage)
> and `app/src/app/(auth)/auth-motion.css` (login / register). This file explains the system and the rules. If you change a token,
> update the table here in the same change.
>
> Last synced with the codebase: **2026-10-14**

---

## 1. Three visual worlds

WorkNest deliberately has three scoped palettes. **Never mix them** and never export
one world's variables into another.

| World | Scope (CSS selector) | Where | Tokens |
|---|---|---|---|
| **Workspace** (the product) | `.app-shell` | Every authenticated route | `--c-*` overrides in `globals.css` — Teal & Ink since 2026-10-11 |
| **Next Level** (homepage) | `.home` | `/` | `--h-*` in `(marketing)/home.css` |
| **Next Level** (sign-in) | `.auth-shell` | `/login`, `/register` | `--a-*`/`--c-*` in `(auth)/auth-motion.css` |

**Light only.** The theme toggle and theme provider were removed; `viewport.colorScheme`
is `light` and the page `themeColor` is the page tint `#f3f6f5`; the install manifest
uses ink `#0f2b2a` for standalone system chrome. The `.dark` / `.dark .app-shell` token blocks
and `--pf-*` night values still exist in the CSS, but **nothing applies the `.dark`
class** — treat them as dormant. Don't build new dark-mode UI unless dark mode is
reintroduced on purpose (and then update this file and `Memory.md`).

## 2. Workspace palette (`.app-shell`) — Teal & Ink

Since **2026-10-11** every logged-in page uses **Teal & Ink**, the palette the owner's
Work Logs and Tracker mockups introduced (it replaced Slate & Sky of 2026-10-08, which was
left on only a few pages and looked out of place). The page is a pale tint, content is
white or open on the tint, ink is the chrome (dock, primary pills, dark cards). Status,
tracker and priority hues (blue In Progress, red / orange / pink / green) are unchanged.
Purple stays banned (user decision 2026-10-03).

| Token | Value | Use |
|---|---|---|
| `--c-wl-page` | `#f3f6f5` | **page tint** behind every app page (`main#main`) |
| `--c-bg` / `--c-surface` / `--c-card` | `#ffffff` | cards, inputs, menus, panels |
| `--c-surface-2` | `#eef3f1` | hover, toolbars, count chips |
| `--c-surface-3` | `#dfe8e5` | pressed / selected |
| `--c-card-tint` / `--c-card-navy` | `#eef6f4` / `#d6ebe6` | teal emphasis cards (names historical) |
| `--c-text` | `#102826` | headings, primary values (15.2:1) |
| `--c-text-muted` | `#4a5d5a` | descriptions (6.6:1) |
| `--c-text-subtle` | `#5b6d6a` | sublabels, hints (5.5:1) |
| `--c-border` | `#c7d2cf` | hairlines, card edges, dividers (decorative) |
| `--c-border-strong` | `#6b7d7a` | **functional** control edges — inputs (4.3:1) |
| `--c-primary` | `#13706a` | teal — fills, icons, focus (white 5.9:1) |
| `--c-primary-strong` / `--c-accent-text` / `-hover` | `#0f5d58` | links, small labels (7.4:1) |
| `--c-primary-active` | `#0b4a46` | pressed |
| `--c-primary-subtle` | `#d6ebe6` | selected state, tag chips |
| `--c-ring` | `#13706a` | focus ring |
| `--c-sidebar` (+`-2`,`-3`) | `#0f2b2a` / `#173836` / `#1d4240` | **ink**: the dock, primary pills, dark cards (name historical) |
| `--c-sidebar-fg` / `-muted` / `-subtle` | `#fff` / `#d3dddb` / `#9fb1ae` | text on ink |
| `--c-danger` / `--c-warning` / `--c-info` | `#c43e3e` / `#9a560f` / `#0369a1` | feedback; success stays green `#15803d` |

The dock is ink; the current section is a white pill with ink text. MUI
(`components/ui/mui-provider.tsx`) uses the same teal/ink. Per-icon colours (`--c-ic-*`)
map onto teal `#13706a` (blue/green/cyan/violet/teal), deep teal `#0f5d58` (indigo), ink
grey `#4a5d5a` (slate), and the unchanged red/orange/amber/pink. The Work Logs deck,
Tracker and the rest of the page family still set the same values in `.wl-deck, .tk-focus`
(plus the amber `--c-wl-*` tokens), so they stay correct if the base ever changes.
Password forms in registration, Profile and Admin share the same live strength meter,
confirmation status and reveal control; the meter uses a reduced-motion-safe transform.

### Type scale (2026-10-11)

One fluid scale for every page in the family (`.tk-focus` classes, `globals.css`),
checked against ui-ux-pro-max and the responsive-design skill. Sizes run 375px → 1440px:

| Class | Size | Use |
|---|---|---|
| `.page-title` (and `.wl-title`) | `clamp(2rem, 1.4rem + 2.35vw, 3.5rem)` — 32→56px, 800 | the page's h1 (via `PageHead`) |
| `.tk-section` | 22→32px, 700 | section headings (Favourites groups, a ticket's title) |
| `.tk-card-title` | 19→26px, 700 | card / item titles (Resources, Favourites) |
| `.tk-row-title` | 16→20px, 600 | Tracker row titles |
| `.tk-hero` / `.tk-hero-line` | 80→208px / 24→36px | Notes' summary display count and its line |
| `.tk-stat` / `.tk-index` | 28→40px / 32→48px | Notes summary counts / Tracker row numbers |
| `.tk-col-title` | 24→32px | Tracker column titles |
| `.tk-eyebrow` / `.tk-label` | 13px / 12px uppercase | group labels, dates / stat labels |
| body | `text-lg` 16px for descriptions; `text-md` 15 / `text-base` 14 for meta | |

**Floors:** nothing renders below **12px** (`--text-2xs` raised from 11 to 12); on phones
every input, select, textarea and editor is **16px** (an unlayered rule in `globals.css`,
so iOS never zooms on focus). Shared buttons and password reveals expand to at least
**44px on phones** while retaining their denser desktop sizes. Small text-like links use
`.tap-area` (about a 44px hit box) without changing visual layout.

### Work Logs deck (2026-10-09)

`/work-logs` uses its own deck header, not `PageHead`. It follows the owner's mockup: `.wl-deck`
(globals.css) scopes a teal-and-ink palette to the page (primary `#13706a`, ink
`#0f2b2a` via `--c-sidebar`, amber `--c-warning-subtle` / `--c-wl-dash` / `--c-wl-amber`,
page `--c-wl-page`), a display title (`.wl-title`) and day numeral (`.wl-numeral`) sized
with `clamp()` above the app scale. Day columns are `.wl-col[data-state]`; the open one
grows by animating `flex-grow` (600ms smooth-out), its sections fade up in sequence
(`.wl-reveal`). The page fits between the top of the screen and the dock from lg.
All motion stops under `prefers-reduced-motion`.

### Tracker queue and Notes "F" layout (2026-10-12)

`/tracker` and `/notes` share the owner's teal-and-ink visual family. The wrapper
`.tk-focus` (now on every list page, see Page header) adds
`--c-border-strong #a9b5b3` (composer and editor field edges) and `--c-tk-rule #c7d2cf` (summary rules,
outline pill edges). Header: `PageHead` with the date as `meta`, then 48px pills
(active tab / primary button = ink `bg-sidebar`, idle = white with `--c-border`) and a
`SearchPill` (⌘K). Notes retains layout F's left summary column (`.tk-hero`, `.tk-bar`,
`.tk-stat`) beside its bookshelf. Tracker (owner's mockup, 2026-10-14, second pass): top
line = date eyebrow · tabs + compact search; then the title with the add field beside it.
`.tk-add` is an underline (2px ink, primary on focus), 44px tools and Add. Two equal
columns from lg (`gap-x-14`), each `.tk-col-title` (24→32px, 800) + count (amber when it
needs you, else subtle) over a 2px rule (solid amber `--c-wl-dash` / ink). Rows: hairline
separators, an uppercase `.tk-label` status eyebrow above the title, a 22px round tick on
to-dos and upcoming rows. Finished entries collapse under "✓ N completed today · Show". The note composer is
a `.tk-field` card (title · hairline · body · toolbar). Entry dialogs use `Modal size="xl"`.
The `.tk-*` type classes are scoped under `.tk-focus` so they beat `.app-shell main hN`.
Sizes: see Type scale.

### Page header — `PageHead` (2026-10-11)

Every list page — Tickets, Tracker, Notes, Resources, Favourites, Profile, Achievements,
Reports — is wrapped in `.tk-focus` and starts with **`PageHead`**
(`components/shell/page-head.tsx`): `.page-title` h1, optional inline `meta` (the date)
and a `description` under it, optional stat counts, actions on the right (full width on
phones; the title keeps clear of the floating avatar). The same file exports the shared
controls: **`SearchPill`** (48px, optional ⌘K), **`UnderlineTabs`** (bold current tab
with an ink underline; scrolls sideways; links or buttons) and the pill class strings
**`primaryPill`** (ink, 48px) and **`outlinePill`** (white, `--c-tk-rule` edge, 44px).
The slate `PageBand`, `bandButton`, `.wl-band` and `.wl-fit` are gone (2026-10-11);
`page-band.tsx` keeps only `bandField` for Quick log's band button. Work Logs keeps its
own deck header (`.wl-title`, same size as `.page-title`); document pages (note
reader/editor, work-log editor/detail) keep theirs. **No shadows, no tinted boxes** in
the page; floating layers (menus, dialogs, toasts) keep `--sh-md` / `--sh-lg`.

### Page layouts (2026-10-08 redesign)

Every workspace page has its **own layout pattern** (owner's request: "don't use the same
components"); keep them distinct when adding to a page:

| Page | Pattern |
|---|---|
| Tracker | date · tabs + search → title + add field → **two columns** (Today \| Upcoming, Needs you \| Waiting, composer \| notes); finished entries collapse under one *Show* line; entry opens in a two-column dialog |
| Work Logs | split hero (form + slate sprint card with ring) → **vertical timeline** per sprint |
| Work-log editor | action strip → **one document** (`.wl-doc` turns section cards into ruled chapters) + margin outline |
| Work-log detail | **slate details panel** (`.wl-hero` tokens) + bento of cards |
| Tickets | `PageHead` (status ratio bar) + New ticket + search → **underline status tabs** → open ticket list (sticky from lg, teal selected row) beside the **open ticket** card; its journey is compact and latest update is surfaced first; list first on phones |
| Favourites | `PageHead` → **underline tabs** (All · Important · Notes · Resources, `?show=`) → Important as a two-column section, then Notes and Resources side by side; items = disc + meta + big title |
| Notes | layout "F": title + search + New note → **summary column** (notebook count, cover-colour bars, sections/pages/starred) + **bookshelf** of accent-coloured covers |
| Note reader | **three-column docs** (contents · page · on this page at xl) |
| Resources | title + line · underline search + Add → rule → **Type / Tags column** (13rem; ink left bar on the current type; mono tags) beside **one list** (eyebrow "ALL RESOURCES · N" + sort menu over a 2px ink rule; rows = 40px rounded initials tile in ink/teal/amber, bold title ↗ + mono host, description, mono tags, hairline separators) |
| Profile | identity header → **section select on phone/tablet, wrapped tab bar from `lg`** → label/control rows |
| Achievements | totals strip → **centred rail, alternating cards** from lg |
| Reports | **sprint card rail** → paper on a desk |
| Admin | `PageHead` → **four compact system totals** (two columns on phones) → responsive account master/detail: short scrollable directory + selected-account statistics and full-width mobile actions; stacked below `lg`; password/destructive forms use native dialogs |

Breakpoints are `xs 360 · md 768 · lg 1024 · xl 1440` — there is **no `sm` or `2xl`**.

### Feedback, status, priority, tracker tones

- **Feedback:** `danger #dc2626`, `success #15803d`, `warning #b45309`, `info #1d4ed8`,
  each with `-fg` and `-subtle`.
- **Ticket status** (`--c-status-{open,progress,blocked,waiting,testing,completed,closed}`
  + `-bg` / `-fg`). The UI shows five workflow stages mapped onto these.
- **Priority** (`--c-priority-{low,medium,high,urgent}` + `-bg`) — shown as dot + label,
  never a pill.
- **Tracker tones** `--c-tk-*` — homepage hues, deepened: `overdue #c43e3e` red, `today
  #4562c9` blue, `upcoming #9a560f` orange, `undated #62677d` muted ink (Someday), `done
  #4562c9`, `waiting #9a560f` orange (follow-up, no reply), `replied #b8395f` pink
  (follow-up, your turn), `on #ffffff`. Ticket statuses are **all the same style** —
  light tint + soft ring + dark label, never solid — told apart by hue: In progress blue,
  Sent to QA orange, Ready for production pink, Released muted ink, Done green (blocked
  red); the timeline's "Open for / Done in" pill matches; priorities low ink · medium blue · high orange · urgent pink.
  **Where a tone may appear:** the small dot in a list's uppercase section heading,
  solid date chips (overdue/today), the dot on the Follow-ups tab, and tinted chips /
  initials avatars (10% fill, text = tone + 20% ink so all tones clear 4.5:1 at 12px).
  List cards stay neutral (white + `--c-border`, `surface-2` heading strip) — no tone
  washes over large areas. The active Tracker tab and an active tag chip are solid ink
  (`bg-sidebar text-sidebar-fg`). The page uses the full shell width like other pages; Notes
  and Follow-ups put a titled form card (sticky from `lg`) beside the list.
- **Note accents** (`lib/note-colors.ts`): brand icons keep their real brand hex — the
  one deliberate exception to "tokens only". Generic icons get a stable colour picked
  from the note id.

## 3. Auth palette (`.auth-shell`)

Auth pages use the homepage palette (ink `#2a2c3f`, muted `#575c72`, page `#f3f5f9`) —
the same colours the workspace now uses. They retain their own motion in
`(auth)/auth-motion.css` and composition in `components/auth/auth-shell.tsx` (login =
"resume your day", register = "create your system" — intentionally different layouts).
The art panel shows the user's 3D character as a transparent cut-out
(`public/home/auth-login.webp`: on a pink bean bag with a laptop, pink brush strokes;
`public/home/auth-register.webp`: pointing at a clipboard, blue–violet brush strokes),
`.auth-hero-person`, sized by viewport height so the page never scrolls. Each panel's tint matches its
render's brush strokes (login: soft pinks; register: soft blue–violets), and the register
figure — cut off at the trousers — fades out at the bottom via `mask-image`.
The homepage keeps its own `--h-*` tokens under `.home`; the workspace re-uses its colours.
On phone/tablet auth layouts, the form heading is fixed at 32px; the desktop art layout
retains its viewport-aware 30–48px display scale.

## 4. Homepage + sign-in — "Next Level" (since 2026-10-02)

Built from the user's "Take it to the next level" banner. Homepage scoped by `.home`
(`--h-*` in `app/(marketing)/home.css`), login/register by `.auth-shell`
(`app/(auth)/auth-motion.css`), shared art in `app/brand-art.css`.

- Palette: page `#f3f5f9`, ink `#2a2c3f`, muted `#575c72`, white cards with tinted shadows.
  Decorative tones (`.tone-purple|blue|pink|orange` → `--tone`): `#9b5cf0`, `#7d9cf4`,
  `#f58ea8`, `#f8aa4b` (+ red `#ec6f6f`) — shapes, doodles, number badges, never body text.
- Type: **DM Serif Display** 400 + italic (`--font-dm-serif`) for display; Plus Jakarta
  Sans for text. Italic muted `<em>` ends headings.
- **People**: the user's own 3D characters as transparent WebP cut-outs in
  `public/home/` — `hero-1…4` (hero corners, each on a coloured brush stroke),
  `recap-avatar` (recap centre), `auth-login` / `auth-register` (auth panels). Hero
  figures get a small drop shadow; the auth figures none (a shadow plus the register
  mask drew a grey box). The DiceBear avatars were removed 2026-10-03.
- **Hero**: a 2000×1020 stage with `container-type: inline-size`; headline in `cqi`
  (8.6cqi), people/doodles at % positions measured off the banner. Dark word chip with a
  double outline, italic connector, outlined pill CTA, orange ring drawn around the last
  word; the middle row is centred under the title. No intro paragraph. On snapped
  screens the stage is full width × (viewport − header), people are pinned to the corners
  and sized by height, and the headline is `min(8.6cqi, 12.5vh)`. Phone: taller stage
  (375×560), people tuck into the corners.
- **Screens**: on ≥900px wide and ≥560px tall the page snaps one viewport at a time —
  (1) header + hero + lead, (2) Features, (3) AI recap, (4) How it works + closing CTA +
  footer. Spacing inside screens uses `vh` clamps so each fits a ~600px-tall window.
- **Sections**: Features = `feature-showcase.tsx` (tab list with tone-coloured italic
  numbers + a tinted panel showing a live mini preview of the selected area;
  auto-advances every 4s unless reduced motion is requested; no avatars, no cards).
  On phones, preview grid items use `min-width: 0`, primary row copy ellipsizes and
  supporting status pills may collapse below 360px, so the mock never widens its card;
  the two AI recap spines also reserve rotation clearance inside the phone gutter.
  AI recap = notes paper → AI summary → 5-15 doc joined by marching dashed arrows; How it works =
  centred steps with tone-filled number badges; closing CTA; footer.
- **Type scale** (ui-ux-pro-max: one modular scale, body 1.6): `--fs-xs 13 · sm 14 ·
  base 16 · md 18 · lg 24 · xl 32 · 2xl clamp(36–48) · 3xl clamp(44–72)`; headings
  `max-inline-size: 18ch` + `text-wrap: balance`. Content width `min(100% − 48px, 1360px)`.
- **Login / register**: one screen, no scrolling, no cards — the form sits on the page
  (sizes in `vh` clamps; empty error slots collapse) and beside it one gradient colour
  panel with the 3D character, a serif line and three plain tone-dot points. Panel hidden
  under 900px (the forms already link to each other).
- Motion (all off under `prefers-reduced-motion`): hero lines rise, people pop then
  float, doodles drift, trails march, the ring draws; every full-screen section replays its
  entrance when you arrive (`ScreenMotion`); the auth character is still.

## 5. Typography

Loaded in `app/src/app/layout.tsx` via `next/font` (self-hosted, no runtime Google calls).

| Face | Variable | Used for |
|---|---|---|
| **Geist** | `--font-geist` → `--font-sans` | All authenticated app UI (since 2026-09-28) |
| **Geist Mono** | `--font-geist-mono` → `--font-mono` | Ticket IDs, timestamps, commands, code (ligatures off) |
| Plus Jakarta Sans (+ italic) | `--font-jakarta` | Homepage, login, register body text |
| DM Serif Display (+ italic) | `--font-dm-serif` | Homepage, login, register display type |

**Type scale** (Tailwind `text-*`, 14px app base). **Phones (< 768px) step the body sizes up one notch** — 2xs 12, xs 13, sm 14, base 15, md 16 — and every form field (and the note editor) is 16px so iOS never zooms on focus (2026-10-04). The scale lives in its own non-`inline` `@theme` block so utilities read it via `var()` and the phone override in `globals.css` applies app-wide; headings and display sizes don't change.

| Class | Size | Use |
|---|---|---|
| `text-2xs` | 11 | uppercase micro-labels (+0.06em tracking) |
| `text-xs` | 12 | meta, timestamps |
| `text-sm` | 13 | table cells, badges |
| `text-base` | **14** | app default body |
| `text-md` | 15 | long-form prose (work-log notes, descriptions) |
| `text-lg` | 16 | card titles |
| `text-xl` | 18 | h3 |
| `text-2xl` | 20 | h2 |
| `text-3xl` | 24 | h1 / page title |
| `text-4xl` | 30 | large numerals |
| `text-5xl` | 36 | auth only |
| `text-6xl`–`text-9xl` | 44–72 | marketing only |

**Headings (2026-09-29 pass).** Hierarchy comes from weight and colour, not raw scale
(taste skill; Linear headline ≈ 28px/600):

| Role | Class | Weight | Tracking |
|---|---|---|---|
| Page title (h1, `PageHeader` and the work-log/ticket pages) | `text-3xl lg:text-4xl` (24 → 30px) | 600 | `-0.03em` |
| Work-log editor date h1 | `text-2xl md:text-3xl` | 600 | `-0.03em` |
| Section h2 | `text-lg`–`text-xl` | 600 | `-0.02em` (global) |
| h3 | `text-base`–`text-lg` | 600 | `-0.01em` (global) |

No weight 750 anywhere in the app. Page description: `text-base`, muted, `max-w-[65ch]`.

**Heading semantics (2026-10-02 audit).** Every page has exactly one visible `h1`
(`PageHeader`, or the page's own header) and never skips a level. Page header → body
gap is **24px** everywhere (`PageHeader` `mb-6`; pages laid out with `gap-6` pass
`mb-0`). A string page description renders as `<p>`. Note page content is rendered
with its heading tags shifted down so it nests: reader `h4–h6` (topic is `h3`),
editor `h3–h5`; sizes follow `data-level`, not the tag.

**Note reader scale (2026-10-02).** `.note-prose` is sized only from tokens, so a page's
own headings always sit below the reader's titles. Weight 600 throughout.

| Role | Size | Source |
|---|---|---|
| Section title (reader h2) | 24 → 30 (`text-3xl md:text-4xl`) | `NoteReader` |
| Topic / page title (reader h3, number inline) | 20 → 24 (`text-2xl md:text-3xl`) | `NoteReader` |
| In-page h1 | 18 (`--text-xl`) | `.note-prose` |
| In-page h2 | 16 (`--text-lg`), 700, on a tinted band with a 3px left rule — one colour for every block: `--c-status-progress-fg` text, `-bg` band, `--c-status-progress` rule (per-block colours dropped 2026-10-04) | `.note-prose [data-level="2"]` |
| In-page h3 / h4 | 15 (`--text-md`), bold; level 3 is 700 with a `--c-border-strong` line underneath (sub-topic inside a block). Topics in the reader are separated by a 2px `--c-border-strong` rule; `.note-prose hr` matches | `.note-prose` |
| Body | 15 (`--text-md`), line-height 1.75 | `.note-prose` |
| Tables | 14 (`--text-base`) | `.note-prose` |
| Code block | 13 (`--text-sm`), `--font-mono`, line-height 1.7 | `.note-prose pre` |
| Inline code | 0.875em, `--font-mono`, no ligatures (0.9em/600 inside headings) | `.note-prose code` |
Headings `text-wrap: balance`, body `text-wrap: pretty`, numbers `tabular-nums` (all set
globally in the base layer). Use the `…` character, never `...`. Ticket keys always go
through the `TicketId` wrapper (`font-mono text-sm font-medium`).

### Icon colours (2026-10-01, re-toned 2026-10-03)

Every Lucide icon in `.app-shell` has its **own colour by meaning**. One CSS map at the
end of `globals.css` keyed on Lucide's `lucide-<name>` class — no component changes; a
new icon needs a line in the map (else it inherits the text colour). The token names
are historical; the values are the deepened homepage hues (no purple, no teal):

| Token | Hex | Meaning (icons) |
|---|---|---|
| `--c-ic-blue` | `#0369a1` | dates, time, messages (calendar-*, clock, mail, send, message-*) |
| `--c-ic-violet` | `#0369a1` | tickets, boards (ticket, folder-kanban, square-terminal…) |
| `--c-ic-amber` | `#9a560f` | notes, ideas, favourites (file-text, sticky-note, lightbulb, star) |
| `--c-ic-green` | `#0369a1` | done, add (check, list-checks, plus, upload) |
| `--c-ic-red` | `#c43e3e` | delete, alerts, sign out |
| `--c-ic-orange` | `#b8661a` | edit, tools (pencil, highlighter, wrench, briefcase) |
| `--c-ic-cyan` | `#0369a1` | people, places (user*, users, building, plane, globe) |
| `--c-ic-indigo` | `#075985` | links, library, code (link-*, library-big, app-window…) |
| `--c-ic-pink` | `#b8395f` | tags |
| `--c-ic-teal` | `#0369a1` | search, view, copy, lock |
| `--c-ic-slate` | `#475569` | structural glyphs (chevrons, ×, grip, arrows, editor toolbar) |

All ≥ 4.2:1 on white and `surface-2`. **Exceptions** (icon keeps `currentColor`):
anything inside a solid fill — `.bg-sidebar`, `.wl-hero`, `.bg-primary`, `.bg-danger`,
solid tracker/status chips — and `[role="checkbox"]` ticks (hidden with
`text-transparent` until checked). Inline-styled icons (tag icons, brand logos) keep
their own colour.

### Palette-only pages (2026-10-01)

Every workspace page has **one ink anchor** (the dark `--c-sidebar` chrome) and no
off-palette hues except semantic red/green, orange stars, and real brand logos:

| Page | Ink anchor | Notes |
|---|---|---|
| Nav | — | active link: 600 weight + 3px blue rule, no tinted column |
| Work Logs | "today" panel | unchanged |
| Tickets | list header band + open ticket header band | first ticket opens by default; selected row uses a teal tint + teal leading rule |
| Tracker | active tab, focus lists' toned edge | |
| Notes | stats band (notes · favourites · sections) with the white "New note" CTA | Favourites / All notes groups |
| Resources | current type: ink left bar (bottom bar under lg) | initials tiles in ink / teal / amber; type icons remain in the type picker |
| Favourites | summary band of three count tiles (jump links) | |
| Profile | open section header band, active menu item | |

- **Ticket workflow** (`.app-shell` `--c-status-*`): every stage is a light tint + soft
  ring + dark label, told apart by hue — In progress blue, Sent to QA orange, Ready for
  production pink, Released muted ink, Done green (see §2).
- **Fallback accent colours** (`lib/note-colors.ts`, notes and tags without a brand):
  deepened homepage hues (blue / pink / orange / ink), all ≥ 5:1 on white.
- **Tag icons** (`ui/tag-icon.tsx`): derived from the tag text via the Notes icon index
  — alias or exact name only (no prefix matches), brand colour when known, else a
  stable palette shade; otherwise a coloured tag glyph.

### Hierarchy ladder (workspace pages, 2026-10-01)

What the eye should hit, in order — one step per level, never two the same size:

| Level | Role | Style |
|---|---|---|
| 1 | Page title | `PageHeader` h1, 24 → 30px, 600, `text-balance` |
| 2 | **What needs you** | the `PageHeader` description as a status line (e.g. Tracker: "Needs you: 1 overdue · …", links in 600 weight, overdue in `text-danger`) |
| 3 | Section | h2 `text-xl` (18) 600 |
| 4 | Focus list / card title | `text-base` 600, normal case; *focus* lists get a 4px toned left edge |
| 5 | Secondary group | 12px uppercase micro-label on a `surface-2` strip |
| 6 | Meta | `text-xs` muted/subtle |

- **One solid CTA per surface** (ink `primary`). It is **never shown disabled** for
  "empty input" — a greyed CTA reads as broken; an empty submit focuses the field and
  says what's missing. Disable only while saving.
- **Forms are recessed when content is the point** (Tracker composers: `surface-2`,
  no shadow) so the user's items, in white cards, lead.
- **Row controls are full strength** (reversed 2026-10-01 — dimmed controls read as
  disabled and the page felt washed out).
- **One dark anchor per view:** Profile's open section card has an ink header band
  (`bg-sidebar`, white title, `sidebar-muted` description); the active menu item is
  solid ink. Ordered-list rows carry a soft position badge (`bg-surface-3 text-accent-text`, round) and a ⋮⋮ drag handle — a solid badge on every row was too heavy.
- **No icon tile on every card** when a nav rail already shows the icons.
- Separate inline facts with spacing (`gap-x-4`) or chips, not "·" glyphs — glyphs
  dangle where the line wraps.
- Spacing groups: 32px between sections, 16–20px between cards in a section.

## 6. Layout, spacing, radius, elevation

- **Breakpoints — exactly four:** `xs` 360 · `md` 768 · `lg` 1024 · `xl` 1440.
  **`sm:` and `2xl:` do not exist** (reset on purpose).
- **Shell (2026-10-14):** no sidebar — a sticky, edge-to-edge **top bar** (`.app-dock`,
  deep teal chrome (`#092120`), centred section links, active section marked by a white underline,
  account avatar at the end). Phones show a
  maximum five icon + label destinations and move Favourites into the account menu;
  larger screens show all six destinations. The account menu opens downwards.
  The bar is **white** (2026-10-03 values): `.app-header` re-points the `--c-sidebar-*`
  tokens locally (fg ink `#2a2c3f`, idle labels muted `#575c72`, hover `#f3f5f9`, accent
  blue `#4562c9`, hairline `#dcdfe8`), so primary buttons elsewhere stay ink. The brand
  tile is blue. The current section is a blue underline with no fill behind it.
  Below `md` sections move into a sheet; `md` shows text-only links with the brand icon
  (brand text hidden to make room); `lg` adds the brand text and account name; `xl`
  adds section icons and the date. Labels are `whitespace-nowrap`. Content capped at
  1360px (`max-w-[85rem]`). Skip-to-content link. No horizontal body scroll — wide
  content scrolls inside itself. Anything sized against the nav (`.tickets-board`
  height, sticky asides at `top-20`) assumes 4rem.
- **Page rhythm:** page title block → 32px (`mb-8`) → content. Sections inside a page
  are separated by 20–24px (`gap-5`/`gap-6`).
- **Spacing:** Tailwind 4px scale. Page padding `px-4 md:px-5 lg:px-8` (16px on phones since 2026-10-04; the nav and any edge-to-edge sticky bar use the same values as negative margins).
- **Touch targets:** controls are at least 32px on phones. Text-like controls that can't grow visually ("1 overdue", "All work logs") use `.tap-area`, an invisible 8px box above/below that enlarges the hit area without moving layout; resource row icon buttons are `size-9 md:size-7`.
- **Radius:** `xs 3` dots · `sm 4` badges · `md 6` inputs/menu items · `lg 8` panels ·
  `xl 12` dialogs · `2xl 16` max. Buttons and chips are `rounded-full`. Work-log cards
  (`.wl-card`) use 16px.
- **Elevation: none on the page** (owner, 2026-10-09). In `.app-shell`, `--sh-xs`,
  `--sh-sm`, `--sh-card`, `--sh-card-hover` and `--sh-button` are `none`; surfaces are
  separated by `--c-border` only. `--sh-md` / `--sh-lg` remain **only** for layers that
  float over the page (menus, toasts, dialogs, the sticky Profile save bar). Don't add
  shadows or tinted fills (`card-tint`) to in-page boxes.

## 7. Motion

**Authenticated app motion (2026-10-11).** `PageMotion` uses GSAP to choreograph each
route's major header/section/card regions on load, always beginning above the resting
position and proceeding in reading order. Motion varies by page family rather than
using one effect everywhere: Tracker/Notes = editorial vertical sequence;
Resources/Favourites = soft depth/scale; Admin/Profile = lateral console panels;
Tickets/Reports/Achievements = compact alternating workflow rows; editors/new pages =
quiet document settle. Durations are 560ms with 65–100ms family-specific staggers.
Existing `data-reveal` / `data-reveal-stagger` markup participates in load choreography.
Work Logs keeps its own indexed 500ms date-card animation and is excluded from GSAP so
it is not double-animated. Nothing animates in response to scrolling. No JS and
`prefers-reduced-motion` show everything immediately.

**Local environment marker.** When Git-ignored `app/.env.local` sets
`WORKNEST_LOCAL=1`, every React route gets a full-viewport tint and border plus a large
top-centre `LOCAL DEVELOPMENT` ribbon. The tint/accent values come from ignored
`WORKNEST_LOCAL_TINT` / `WORKNEST_LOCAL_ACCENT`, not tracked CSS. The layer is
non-interactive and absent in production.

Tokens in `:root`: `--duration-{stagger 40, micro 80, quick 150, fast 250, medium 350,
slow 400, very-slow 500}ms`, `--ease-smooth-out`, `--ease-bounce`, distance/scale/blur
tokens. Utilities: `.motion-page-enter`, `.motion-stagger`, `.motion-lift`,
`.motion-disclosure-content`, `.scroll-reveal`, `.t-dropdown`, `.t-sheet`.

- Motion dial for the app: **4/10** (standard, not cinematic). State transitions
  150–250ms. Buttons press with `active:scale-[0.98]`.
- Animate `transform` and `opacity` only; GSAP route choreography follows the same rule. List CSS properties explicitly
  (`transition-[transform,opacity]`), never `transition-all`. Moving indicators
  (such as meeting tabs) position with `translate3d`, not `left/top`.
- Navigation never animates in; only the route content well is keyed.
- `prefers-reduced-motion` disables all of it.
- Homepage scrolling moves **one section per scroll** on desktop (≥900×560): native CSS
  `scroll-snap-type: y mandatory` + `scroll-snap-stop: always` — no JS paging (it made you
  wait). Phones scroll freely; nav links smooth-scroll. Looping decoration pauses on screens
  that aren't active, and animated art is `will-change`-promoted.
- Homepage: CSS keyframes for the hero; `ScreenMotion` (`components/home/screen-motion.tsx`)
  replays each snapped screen's `[data-anim]` entrance on every arrival, from either
  direction. Content is visible without JS; hiding is armed only after on-screen sections
  are marked active, so nothing on screen flashes out.

## 8. Components

All under `app/src/components/`. Use these before writing new markup.

### Primitives — `ui/`
| Component | Notes |
|---|---|
| `Button`, `buttonVariants` | cva. Variants: `primary` (ink), `subtle`, `secondary`, `outline`, `ghost`, `danger`. Visual sizes from `md`: `xs 28` / `sm 32` / `md 36` (default) / `lg 40`; all expand to a 44px minimum touch box below `md`. Props `iconOnly`, `block`, `loading`. Rounded-full. |
| `Input`, `Select`, `Textarea` | MUI-backed fields (see §9). Never re-patch borders at call sites. |
| `Field`, `FormError` | Visible label + control + error/hint wired with ids. Never placeholder-only labels. |
| `Badge`, `TicketId` | Generic badge; `TicketId` is mandatory for ticket keys. |
| `TicketStatusBadge`, `TICKET_STATUS_DOT` | Status colours + labels + order (all tinted badges). |
| `ProjectInput` | MUI Autocomplete (freeSolo) of the user's project names; loads on open, no module cache. |
| `TagInput`, `normalizeTag` | MUI Autocomplete (multiple + freeSolo) chip field over existing tags. Click or ↓+Enter picks a suggestion; Enter/comma adds typed text; blur keeps typed text. Tags normalised (lowercase, no `#`, spaces → `-`), max 25. No `autoHighlight` — in MUI 9 freeSolo, Enter commits typed text, so a pre-highlight would mislead. |
| `Modal` | Native `<dialog>`: header (eyebrow + title + close), scrolling body, optional footer; `md`/`lg`/`xl` (xl = max-w-5xl, the Tracker entry dialog). Backdrop close only when the press **and** the click are both on the backdrop. |
| `ConfirmationDialog` | Native `<dialog>`; `destructive` uses the danger button; async `onConfirm`. |
| `EmptyState` | Muted icon, one line, one action. |
| `Toaster`, `toast` | sonner, bottom-right, max 2. Import `toast` from here, never from sonner. **Not for autosave.** |

### Shell — `shell/`
`AppShell`, `AppNav` (responsive full-width top bar + downward-opening account menu), `nav-items.ts`
(`PRIMARY_NAV`, `navFor(ticketsEnabled)`, `isActivePath`), `Menu` (doesn't close on a
submit button, so form actions still fire), `PageHeader`, `ComingSoonPage`. The nav's
right side holds `QuickLogButton variant="nav"` (44px icon on phones, 36px icon md–lg,
icon + label from xl).

### Feature components
`work-log/*` (editor, sections, ticket search/card/history, save status, attachments,
learning, day type/stamp, copy button). On work-log detail, To-dos is the first card in
the right content column, followed by Ticket history and Work done; Ticket work and
Meeting notes stack independently on the left.
Other feature components: `tickets/ticket-board`, `tracker/tracker-board`
(all per-kind wording lives in `KIND_META`), `notes/*` (TipTap editors, icon picker,
viewer, TOC), `resources/resource-library`, `profile/profile-form`, `auth/*`,
`home/*` (homepage), `quick-log/quick-log` (`QuickLogProvider` + `useQuickLog().open(kind?)`,
`QuickLogButton`; a `Modal size="lg"` with Choose → Paste → Review steps; review rows =
tick box + label pill (new = success-subtle, update = primary-subtle, needs you =
warning-subtle) + inline editor). Dialogs must render inside `.app-shell` or they fall
back to the old default palette.

Tracker's **Needs you** is the amber group at the top of the To-do queue. It shows
actual subjects, acts in place (Mark done / Mark nudged), and an empty group says so in
one calm line. Follow-up creation uses a searchable, free-text people autocomplete;
the reminder date is labelled **Remind me on** and includes a plain-language hint so it
cannot be mistaken for the date the follow-up was added or an expected reply date.

### CSS recipes in `globals.css`
`.wl-card` / `.wl-card-head` (work-log card), `.wl-hero` (ink header that re-points
tokens so normal components render light-on-ink; `.wl-solid` / `.wl-field` reset to
light inside it), `.wl-inset`, `.wl-off` (hatched holiday/leave tile), `.wl-scroll`
(slim scrollbar), `.worklog-prose` (Markdown fields, 15px), `.note-prose` /
`.note-editor-body` (Notes editor), `.tickets-board` (fits the viewport at `lg`).

## 9. MUI inside Tailwind

Form fields use MUI (`@mui/material` 9) via `components/ui/mui-provider.tsx`, mounted
in the `(app)` layout only.

- `@layer theme, base, mui, components, utilities;` — MUI lives in `@layer mui`
  (`enableCssLayer`), so Tailwind utilities passed through `className` win.
- MUI's palette holds concrete hexes (it computes alphas); every visible colour in the
  overrides reads CSS tokens.
- **Popups inside dialogs:** MUI portals menus/listboxes to `<body>`, which sits
  *below* a native modal `<dialog>` (top layer). The theme's `MuiPopper` /
  `MuiPopover` defaults portal into the open `dialog:modal` instead (else into
  `.app-shell`, so popups inherit the workspace tokens; else `<body>`),
  and Poppers use `strategy: "fixed"` so the dialog's `overflow: hidden` can't clip
  them. Any MUI field works inside `Modal` with no extra props.
- MUI draws its own 2px blue focus border, so the global outline is suppressed on
  `.MuiInputBase-input`, `.MuiSelect-select`, `.MuiAutocomplete-input`.
- Deliberately *not* MUI: tiny inline micro-controls (e.g. the Notes move-to-section
  pill, code-block language chip).

## 10. Rules (non-negotiable)

1. **Tokens only.** No raw hex, px font sizes or ad-hoc shadows in components. The
   only exception is brand colours in `lib/note-colors.ts`.
1a. **One accent for UI chrome** (buttons = ink; links, focus, selection = blue).
   Coding colour is allowed where it helps scanning: status, priority, Tracker date
   groups, feedback, note brand colours, and **Resources types** — each of the 10 types
   keeps its own hue (`TYPE_COLOR` in `resource-library.tsx`: Documentation `#2563EB`,
   Learning `#16A34A`, Reference `#D97706`, Tool `#0D9488`, Website `#0284C7`, App
   `#7C3AED`, Link `#DB2777`, Command `#EA580C`, Snippet `#4F46E5`, Other `#284B63`).
   The owner chose these over a single accent (2026-09-29) — don't flatten them.
2. `--c-primary` is for large text, icons and fills; normal-size text uses
   `primary-strong` / `accent-text`.
3. Control edges use `border-border-strong` (≥3:1, WCAG 1.4.11); `border-border` is
   decorative only.
4. Focus is always visible: 2px `--c-ring`, 2px offset. The ring never changes a
   control's `border-radius`.
5. Icons: **Lucide** in the app (`iconLibrary: "lucide"`), react-icons for note icons
   only.
6. Minimal modals. Prefer inline creation (including the standalone New ticket form).
7. Nothing implies history can be rewritten: no edit/delete affordance on
   `TicketWorkUpdate` or `FollowUpUpdate` rows.
8. Check every new screen at 375, 768, 1024 and 1440 — nav on one line, no clipped
   labels, no horizontal scroll.
9. Destructive confirmations use `ConfirmationDialog` (or an Undo), never
   `window.confirm` / `alert`.
10. Only `xs md lg xl` breakpoints exist — an `sm:` class silently does nothing.

### Sources

Rules above were checked against (2026-09-29): the **redesign-existing-projects** and
**design-taste-frontend** skills (taste-skill), **ui-ux-pro-max** (pre-delivery
checklist; its generated font/pattern suggestions didn't fit a dense app and were not
used), **Vercel Web Interface Guidelines** (vercel.com/design/guidelines) and the
**Linear** DESIGN.md from awesome-design-md (type scale, 64–72px nav, 4px spacing).
Palette and fonts are unchanged.
