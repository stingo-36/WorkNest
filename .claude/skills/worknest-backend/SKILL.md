---
name: worknest-backend
description: WorkNest server-side rules and patterns — server actions, lib functions, Zod validation, Prisma schema changes, route handlers, the Kaizen mobile API and user scoping. Use before changing anything in app/src/actions, app/src/lib, app/src/app/api or app/prisma.
---

# Server work in WorkNest

Find the files first with `worknest-codemap`. Layering (Arch §4):

```
client component → actions/*.ts ("use server")
                     1. requireUserId()          lib/session.ts — identity from the session only
                     2. parseOrFail(schema, in)  schema lives in lib/validation.ts
                     3. lib/<area>.ts fn(userId, …)   "server-only", userId in every WHERE
                     4. revalidatePath(...)      every page that shows the data (+ /favourites)
                     5. return ok(row) / notFound(...)   ActionResult from lib/result.ts
```

Copy the pattern from `actions/content.ts`. Full recipes: `skills.md` §2 (action), §3
(schema), §4 (page/nav), §6 (favourite flag), §9 (seeds), §11 (deploy).

## Never break

- **User isolation.** Never trust a `userId` or id from the client. Single-row writes use
  `updateMany`/`deleteMany({ where: { id, userId } })` and check `count`. Cross-account
  code exists only in `lib/admin.ts` behind `requireAdmin()`.
- **Append-only history.** No edit/delete for `TicketWorkUpdate` (except same-log autosave
  upsert + detach) or `FollowUpUpdate`.
- **Sprint maths** only in `lib/sprint.ts`; work-log dates via `lib/worklogs.ts` helpers.
- **Schema:** additive changes (nullable/defaulted), `userId` + cascade + `userId`-led
  indexes on new models; `npm run db:migrate`; never edit an applied migration or
  `src/generated/prisma`. Merging to `main` migrates the live DB (Production build).
- **Uploads** > 1 MB go through a route handler under `app/api/`, not an action.
- **Mobile API** (`/api/mobile/*`): public in the proxy, so every handler starts with
  `verifyMobileToken(request)` and answers via `mobileJson` / `preflight` from
  `lib/mobile-api.ts`. Reuse the same Zod schemas and lib functions as the web actions.
- **AI** is OpenRouter only (`lib/ai-summary.ts`), no code-built fallback; failures
  surface as `AI_UNAVAILABLE`.
- Next.js 16: `proxy.ts` not middleware, `params` is a Promise. Unsure of an API? read
  `app/node_modules/next/dist/docs/`.

## Verify

`npm run typecheck && npm run lint`; schema → migration created + client regenerated;
data rules → exercise the flow and check `npm run db:studio`. Ask before any command
that replaces data (seeds, `db:reset`, `db:hosted -- --seed`). Then `worknest-docs-sync`.
