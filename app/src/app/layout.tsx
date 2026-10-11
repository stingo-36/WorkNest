import type { Metadata, Viewport } from "next";
import {
  DM_Serif_Display,
  Geist,
  Geist_Mono,
  Plus_Jakarta_Sans,
} from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

/**
 * Type — design.md §6. Geist is the app UI face (2026-09-28 refresh, per the
 * taste + redesign skills): a crisp neo-grotesk with real Medium/SemiBold
 * steps, so dense 13-14px labels keep a clear hierarchy. Geist Mono carries
 * ticket IDs, timestamps and code, and shares Geist's metrics.
 *
 * Plus Jakarta Sans stays loaded for the PUBLIC pages only (homepage, login,
 * register), which reference `--font-jakarta` directly; its italic file is loaded
 * so italic text isn't a synthesised oblique.
 *
 * Self-hosted by `next/font` (no Google request at runtime, no layout shift).
 */
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

/** Ticket IDs, timestamps, saved commands. Ligatures are switched off in CSS. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-jakarta",
});

/**
 * Display serif for the public pages (homepage, login, register) — matches the
 * user's "Take it to the next level" banner: sturdy, high-contrast, one weight.
 */
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: {
    default: "WorkNest",
    template: "%s · WorkNest",
  },
  description:
    "Daily work logs, meeting notes, and ticket updates in one focused WorkNest.",
  applicationName: "WorkNest",
  // Installable on iPhone/iPad: "Add to Home Screen" opens it full-screen with
  // this name (manifest.ts covers Android and desktop). The icon is app/apple-icon.png.
  appleWebApp: { capable: true, title: "WorkNest", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Light-only site: the browser chrome matches the app's page tint.
  themeColor: "#f3f6f5",
  colorScheme: "light",
  // Edge to edge on notched phones; the dock and shell pad with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The switch lives in ignored app/.env.local. Production receives neither
  // the variable nor this marker unless somebody deliberately configures it.
  const showLocalMarker = process.env.WORKNEST_LOCAL === "1";
  const localTint = process.env.WORKNEST_LOCAL_TINT;
  const localAccent = process.env.WORKNEST_LOCAL_ACCENT;

  return (
    <html
      lang="en"
      className={`h-full ${geist.variable} ${geistMono.variable} ${jakarta.variable} ${dmSerif.variable}`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text">
        <Providers>{children}</Providers>
        {showLocalMarker && localTint && localAccent ? (
          <div aria-label="Local development environment" className="pointer-events-none fixed inset-0 z-100">
            <div
              aria-hidden="true"
              className="absolute inset-0 border-4 mix-blend-multiply"
              style={{ backgroundColor: localTint, borderColor: localAccent }}
            />
            <div
              className="absolute top-0 left-1/2 min-w-56 -translate-x-1/2 rounded-b-xl px-6 py-2 text-center font-mono text-sm font-black tracking-[0.18em] text-white uppercase shadow-lg"
              style={{ backgroundColor: localAccent }}
            >
              Local development
            </div>
          </div>
        ) : null}
      </body>
    </html>
  );
}
