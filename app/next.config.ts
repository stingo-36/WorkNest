import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    serverActions: {
      allowedOrigins: ["192.168.31.130:3000"],
    },
  },
};

export default nextConfig;
