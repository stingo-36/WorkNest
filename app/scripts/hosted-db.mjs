// Run Prisma migrations (and optionally the seed) against the HOSTED database.
//
//   npm run db:hosted          -> prisma migrate deploy
//   npm run db:hosted -- --seed -> migrate deploy + seed (WIPES all users first!)
//
// Reads HOSTED_DATABASE_URL from app/.env (gitignored) — use the DIRECT /
// unpooled connection string; migrations can fail through a pooler. The local
// DATABASE_URL is left untouched.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.HOSTED_DATABASE_URL;
if (!url) {
  console.error("Set HOSTED_DATABASE_URL in app/.env (the Neon *direct* connection string).");
  process.exit(1);
}
const host = (() => { try { return new URL(url).host; } catch { return "(unparseable URL)"; } })();
const env = { ...process.env, DATABASE_URL: url };
const run = (args) => {
  console.log(`\n→ npx prisma ${args.join(" ")}   [${host}]`);
  const r = spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(["migrate", "deploy"]);
if (process.argv.includes("--seed")) {
  if (!process.env.SEED_PASSWORD) {
    console.error("Set SEED_PASSWORD in app/.env first.");
    process.exit(1);
  }
  run(["db", "seed"]);
}
console.log("\nHosted database is ready.");
