import type { MetadataRoute } from "next";

/**
 * Web app manifest (2026-10-11): lets WorkNest be installed to a phone's home
 * screen (and as a desktop app) and open full-screen like a native app. Colours
 * are the app palette: the page tint behind the splash, ink for the system bar.
 * Opens on the Tracker (the post-login landing); signed out, the proxy sends it
 * to /login as usual.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "WorkNest",
    short_name: "WorkNest",
    description: "Daily work logs, to-dos, follow-ups, notes and tickets in one place.",
    start_url: "/tracker",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f6f5",
    theme_color: "#0f2b2a",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon for these.
    shortcuts: [
      { name: "Work Logs", url: "/work-logs", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tracker", url: "/tracker", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Notes", url: "/notes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
