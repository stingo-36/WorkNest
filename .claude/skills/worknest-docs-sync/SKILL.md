---
name: worknest-docs-sync
description: Update WorkNest's project memory (code map, PRD, Architecture, Design-System, Memory, skills.md, agents) after a change. Use at the end of every WorkNest task that changed code, schema, UI or process — and whenever the docs-check Stop hook reports drift.
---

# Sync the WorkNest docs

The docs are the project's memory: future agents read them *instead of* the code, so a
stale doc costs a full re-scan. Edit surgically — the affected rows only — and bump
**"Last synced"** to today's absolute date (e.g. 2026-10-23) on each file you touch.

## 1. See what changed

```bash
git status --porcelain
git diff --stat            # plus `git diff <file>` for anything unclear
```

## 2. Walk this table

| If the change… | Update |
|---|---|
| Added, moved, renamed or deleted any file under `app/src` | `.claude/skills/worknest-codemap/SKILL.md` — put it in its feature section |
| Added/changed a user-facing feature or route | `PRD.md` §4 inventory + the feature's §5 section; `Architecture.md` §3 routes |
| Added/moved a module, action, lib file, route handler or script | `Architecture.md` §2 layout, §4 modules, §8 scripts |
| Changed `schema.prisma` / added a migration | `Architecture.md` §5 (§6 if an invariant moved); migration count in §2 |
| Changed tokens, fonts, breakpoints, component APIs, visual rules | `Design-System.md` (tables must match `globals.css`) |
| Made a choice someone could second-guess, reversed one, hit a gotcha | `Memory.md` → Decisions (newest first) or Gotchas |
| **Any task** | `Memory.md` → Changelog, newest first: `- YYYY-MM-DD — what changed — key files` |
| New or changed repeatable procedure | `skills.md` recipe (and its Index) |
| Changed how agents work, or added/removed a skill or agent | `AGENTS.md`, `skills.md` §13, the codemap's "Agent setup" line |

Find a section without reading the whole doc: `grep -n "^## \|^### " Architecture.md`.

## 3. Prove it

```bash
npm run docs:check         # code map ↔ codebase; must print "matches"
```

Then say in your report which docs you updated. If a doc was already wrong before your
change, fix that too — note it in the changelog line.
