---
name: worknest-ui
description: WorkNest's design rules in one page — tokens, type, breakpoints, primitives, states and where each lives. Use before any WorkNest UI, styling, layout, responsive or redesign work, instead of reading Design-System.md or globals.css end to end.
---

# Build UI the WorkNest way

Full reference: `Design-System.md` (585 lines). Open only the section you need:

| Need | Section |
|---|---|
| Workspace colours / tokens (`.app-shell`, Teal & Ink) | DS §2 |
| Type scale, page header, page layouts, Work Logs deck, Tracker/Notes layouts | DS §2 subsections |
| Sign-in / register look | DS §3 · Homepage DS §4 |
| Fonts, icon colours, hierarchy ladder | DS §5 |
| Spacing, radius, elevation | DS §6 · Motion (GSAP families) DS §7 |
| Which component to reuse | DS §8 · MUI inside Tailwind DS §9 |
| **Non-negotiable rules** | DS §10 — read before shipping |

## Rules that catch most mistakes

- **Tokens only.** No raw hex, px font sizes or ad-hoc shadows. Utilities like
  `bg-surface`, `text-text-muted`, `border-border-strong`, `text-accent-text`,
  `bg-card-tint`, `shadow-card`. New token → `app/src/app/globals.css` (`:root` /
  `.app-shell`) + `@theme inline` mapping → DS table (Recipes §8).
- **Light only.** Breakpoints `xs md lg xl` — there is **no `sm:`**. Mobile-first.
  Check 375 / 768 / 1024 / 1440, no horizontal page scroll, nav on one line.
- **Reuse primitives** in `components/ui/` (Button, Field + Input/Select/Textarea, Modal,
  ConfirmationDialog, EmptyState, Badge/TicketId, TicketStatusBadge, TagInput,
  ProjectInput, toast). List pages start with `PageHead` from `components/shell/page-head.tsx`.
- **States:** empty (`EmptyState`, one action), loading (`loading.tsx` / button
  `loading`), error (`loadError` prop pattern). Destructive → `ConfirmationDialog destructive`.
- **Autosave** long text with `SaveStatusProvider` (`components/work-log/save-status.tsx`);
  never toast on autosave.
- **Access:** visible label (`Field`), keyboard reachable, visible focus, 44px touch
  targets on phones, inputs ≥ 16px on phones, reduced-motion support.
- `globals.css` is ~1.9k lines: `grep -n "<class or token>"`, don't read it whole.

## Deeper design skills (project, in `.claude/skills/`)

Use only for what DS doesn't cover: `redesign-existing-projects` (improve a screen),
`design-taste-frontend` (§1 dials, §4, §9, §11 only; app dials variance 5 / motion 4 /
density 7), `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py
"<query>" --domain ux`; ignore its fonts/palettes), `responsive-design`.

## Verify

Run the app (`npm run dev`, or the `run` skill / browser preview at `localhost:3000`, not
`127.0.0.1`) and look at the changed screens at the four widths. Then
`worknest-docs-sync` if you changed tokens, components or rules.
