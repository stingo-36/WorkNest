#!/usr/bin/env node
// One-command local setup for WorkNest. Safe to re-run: every step checks
// first and skips what is already done.
//
//   npm run setup   -> set everything up, then stop
//   npm run dev     -> runs this first, then starts the dev server
//
// Steps: check Node + Docker -> create app/.env (with generated secrets) ->
// install app dependencies -> start Postgres (Docker) -> apply migrations ->
// seed a demo account ONLY when the database has no users yet.
//
// Zero dependencies on purpose: it runs before `npm install` has happened.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");
const ENV_FILE = join(APP, ".env");
const ENV_EXAMPLE = join(APP, ".env.example");
const WIN = process.platform === "win32";

const step = (message) => console.log(`\n\x1b[36m›\x1b[0m ${message}`);
const done = (message) => console.log(`  \x1b[32m✓\x1b[0m ${message}`);
const fail = (message, hint) => {
  console.error(`\n  \x1b[31m✗ ${message}\x1b[0m`);
  if (hint) console.error(`    ${hint}`);
  process.exit(1);
};

/** Runs a command with live output; exits with a hint if it fails. */
function run(command, args, { cwd = ROOT, hint } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: WIN });
  if (result.status !== 0) fail(`\`${command} ${args.join(" ")}\` failed.`, hint);
}

/** Runs a command quietly and returns its trimmed stdout (null on failure). */
function capture(command, args, { cwd = ROOT } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: WIN });
  return result.status === 0 ? result.stdout.trim() : null;
}

// 1. Prerequisites ------------------------------------------------------------
step("Checking prerequisites");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  fail(`Node ${process.versions.node} is too old.`, "Install Node 20.9+ (24 LTS recommended): https://nodejs.org");
}
done(`Node ${process.versions.node}`);

if (capture("docker", ["compose", "version"]) === null) {
  fail("Docker (with Compose) was not found.", "Install Docker Desktop: https://www.docker.com/products/docker-desktop");
}
if (capture("docker", ["info", "--format", "{{.ServerVersion}}"]) === null) {
  fail("Docker is installed but not running.", "Start Docker Desktop, wait for it to be ready, then re-run.");
}
done("Docker is running");

// 2. Environment file -----------------------------------------------------------
step("Environment (app/.env)");
if (existsSync(ENV_FILE)) {
  done("app/.env already exists — left untouched");
} else {
  const secret = randomBytes(32).toString("base64");
  const seedPassword = randomBytes(9).toString("base64url"); // 12 chars
  const env = readFileSync(ENV_EXAMPLE, "utf8")
    .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret}"`)
    .replace(/^SEED_EMAIL=.*$/m, `SEED_EMAIL="demo@worknest.local"`)
    .replace(/^SEED_PASSWORD=.*$/m, `SEED_PASSWORD="${seedPassword}"`);
  writeFileSync(ENV_FILE, env);
  done("Created app/.env with a generated AUTH_SECRET and demo password");
}
const envText = readFileSync(ENV_FILE, "utf8");
const envValue = (key) => envText.match(new RegExp(`^${key}="?([^"\\n]*)"?`, "m"))?.[1] ?? "";

// 3. Dependencies ---------------------------------------------------------------
step("Dependencies");
const modules = join(APP, "node_modules");
const installedLock = join(modules, ".package-lock.json");
const lockChanged =
  existsSync(installedLock) && statSync(join(APP, "package-lock.json")).mtimeMs > statSync(installedLock).mtimeMs;
if (!existsSync(modules)) {
  run("npm", ["ci"], { cwd: APP, hint: "Check your network connection and try again." });
  done("Installed (npm ci) and generated the Prisma client");
} else if (lockChanged) {
  run("npm", ["install"], { cwd: APP });
  done("Updated to match package-lock.json");
} else {
  done("Already installed");
}
if (!existsSync(join(APP, "src", "generated", "prisma"))) {
  run("npx", ["prisma", "generate"], { cwd: APP });
  done("Generated the Prisma client");
}

// 4. Database --------------------------------------------------------------------
step("Database (Postgres 16 in Docker, port 5434)");
run("docker", ["compose", "up", "-d", "--wait"], {
  hint: "Is port 5434 already in use? Stop that service or change the port in docker-compose.yml and DATABASE_URL.",
});
done("Postgres is up");

run("npx", ["prisma", "migrate", "deploy"], {
  cwd: APP,
  hint: "Check DATABASE_URL in app/.env points at localhost:5434.",
});
done("Migrations applied");

// The seed REPLACES all users, so it only ever runs on an empty database.
const users = capture("docker", [
  "compose", "exec", "-T", "db", "psql", "-U", "workspace", "-d", "workspace", "-tAc", 'SELECT count(*) FROM "User"',
]);
if (users === "0") {
  run("npm", ["run", "db:seed"], { cwd: APP });
  done("Seeded a demo account");
  console.log(`\n  Demo login   ${envValue("SEED_EMAIL") || "(see SEED_EMAIL in app/.env)"}`);
  console.log(`  Password     ${envValue("SEED_PASSWORD")}   (SEED_PASSWORD in app/.env)`);
} else {
  done(users === null ? "Skipped seeding (couldn't count users)" : `Found ${users} existing account(s) — not seeding`);
}

console.log(
  process.argv.includes("--then-dev")
    ? "\n\x1b[32mSetup complete.\x1b[0m Starting the dev server on http://localhost:3000 …\n"
    : "\n\x1b[32mSetup complete.\x1b[0m Run \x1b[1mnpm run dev\x1b[0m and open http://localhost:3000\n",
);
