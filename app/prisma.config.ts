import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not `env("DATABASE_URL")`: that throws when the variable is missing, and
    // `prisma generate` (run by postinstall) never connects — so a build without
    // a database (e.g. a Vercel Preview with no DATABASE_URL) failed at install.
    // Commands that do connect (migrate, db seed, studio) still fail clearly.
    url: process.env.DATABASE_URL ?? "",
  },
});
