// Vercel's build command. Vercel runs `vercel-build` instead of `build` when the
// script exists, so local `npm run build` is unchanged.
//
// Production deploys apply pending migrations first: code that reads a column
// the database doesn't have yet crashes every page that touches it (PR #16,
// 2026-10-22). If the migration fails, the build fails and Vercel keeps the
// previous deployment live.
//
// Preview deploys never migrate. An unmerged branch must not change the live
// schema, and Previews have no DATABASE_URL anyway.
//
// Uses DATABASE_URL_UNPOOLED (Neon's direct URL) when set, else DATABASE_URL.
import { spawnSync } from "node:child_process";

const run = (args, env = process.env) => {
  console.log(`\n→ npx ${args.join(" ")}`);
  const result = spawnSync("npx", args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (process.env.VERCEL_ENV === "production") {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("Production build needs DATABASE_URL (or DATABASE_URL_UNPOOLED) to apply migrations.");
    process.exit(1);
  }
  run(["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: url });
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}): only Production migrates.`);
}

run(["next", "build", "--webpack"]);
