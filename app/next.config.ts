import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/**
 * One id per deploy, baked into the client bundle and returned by /api/version,
 * so an installed app that stays open can tell it is running old code and
 * refresh itself (2026-11-02). Deterministic — every build worker must agree.
 */
function appVersion() {
  const fromHost = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromHost) return fromHost;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "local";
  }
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
  // The app is intentionally opened from another device on this LAN during
  // development. Next blocks dev assets/endpoints from origins other than the
  // hostname it was started with, which prevents React from hydrating and
  // prevents Server Actions from reaching the auth flow.
  allowedDevOrigins: ["192.168.31.130"],
  // The service worker must never be served stale, or an old one would keep
  // running after a deploy (Next.js PWA guide).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    // Reuse a page you visited in the last 30s instead of re-rendering it on the
    // server, so going back and forth between sections is instant. Server actions
    // call revalidatePath, which clears this cache, so edits still show at once.
    // `static` also covers the nav's full prefetches (<Link prefetch>): a preloaded page
    // is used for up to 60s (default 5 min) so data edited elsewhere is never older than that.
    staleTimes: { dynamic: 30, static: 60 },
    serverActions: {
      allowedOrigins: ["192.168.31.130:3000"],
    },
  },
};

export default nextConfig;
