#!/usr/bin/env node
// Keeps the agent code map honest so agents can trust it instead of re-scanning
// the repo. Zero dependencies, like setup.mjs.
//
//   npm run docs:check     → lists source files missing from the map and map
//                             paths that no longer exist; exits 1 on drift
//   node scripts/check-docs.mjs --hook
//                          → Claude Code Stop hook: also flags code changes in the
//                             working tree with no matching doc change; exits 2 so
//                             the agent fixes the docs before finishing

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "app/src");
const mapPath = join(root, ".claude/skills/worknest-codemap/SKILL.md");
const hook = process.argv.includes("--hook");

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

// A second Stop in a row means we already asked once — never loop.
if (hook && readStdin().stop_hook_active) process.exit(0);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : walk(full);
    return /\.(ts|tsx|css)$/.test(name) ? [full] : [];
  });
}

const map = readFileSync(mapPath, "utf8");
const lines = map.split("\n");
const problems = [];

// 1. Every source file is listed: by full path, or by basename on a line that
//    names its folder (the map's "folder/a.tsx, b.tsx" shorthand).
for (const file of walk(src)) {
  const rel = relative(src, file);
  const name = basename(rel);
  const folder = dirname(rel);
  const listed =
    map.includes(rel) || lines.some((l) => l.includes(`\`${name}\``) && l.includes(`${folder}/`));
  if (!listed) problems.push(`not in code map: app/src/${rel}`);
}

// 2. Every full path in the map still exists.
for (const [, token] of map.matchAll(/`([^`\s]+\/[^`\s]+\.[a-z]+)`/g)) {
  if (token.includes("*")) continue;
  const candidates = [join(src, token), join(root, token), join(root, "app", token)];
  if (!candidates.some((p) => existsSync(p))) problems.push(`code map points at a missing file: ${token}`);
}

// 3. Hook only: code changed but no doc did.
if (hook) {
  let changed = [];
  try {
    changed = execSync("git status --porcelain", { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((l) => l.slice(3));
  } catch {
    // not a git checkout — skip this part
  }
  const code = changed.filter((f) => /^app\/(src|prisma|scripts)\//.test(f) || f.startsWith("scripts/"));
  const docs = changed.filter((f) => /\.md$/.test(f));
  if (code.length && !docs.length) {
    problems.push(
      `code changed (${code.slice(0, 5).join(", ")}${code.length > 5 ? ", …" : ""}) but no doc did — ` +
        "run the worknest-docs-sync skill (at least a Memory.md changelog line)",
    );
  }
}

if (!problems.length) {
  if (!hook) console.log("docs:check — code map matches the codebase.");
  process.exit(0);
}

const report = ["WorkNest docs are out of date:", ...problems.map((p) => `  - ${p}`)].join("\n");
if (hook) {
  console.error(`${report}\nFix with the worknest-docs-sync skill, then finish.`);
  process.exit(2);
}
console.error(report);
process.exit(1);
