import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Login / register frame (Ocean redesign, 2026-11-01; replaced the 3D-character
 * panels). Same sky→aqua page as the workspace.
 *
 *  - login: brand + "New here?" link on top, the form centred on the page with
 *    soft waves behind it.
 *  - register: a progress bar, then the form (which draws its own step list,
 *    since only it knows the step) beside "What you get".
 */
const PERKS: Array<[string, string]> = [
  ["var(--c-ocean-sky)", "Daily work logs"],
  ["var(--c-ocean-aqua)", "To-dos and follow-ups"],
  ["var(--c-primary)", "Ticket history"],
  ["var(--a-amber)", "Notebooks and resources"],
];

export function AuthShell({ variant, children }: { variant: "login" | "register"; children: ReactNode }) {
  const other = variant === "login"
    ? { lead: "New here?", href: "/register", label: "Create an account" }
    : { lead: "Have an account?", href: "/login", label: "Sign in" };

  return (
    <div className={`auth-shell auth-shell-${variant}`}>
      {variant === "login" ? (
        <svg aria-hidden="true" viewBox="0 0 1440 320" preserveAspectRatio="none" className="auth-waves">
          <path d="M0 160 C 240 80 480 260 720 180 C 960 100 1200 240 1440 150 L1440 320 L0 320 Z" />
          <path d="M0 220 C 300 150 560 300 860 220 C 1100 160 1280 260 1440 210 L1440 320 L0 320 Z" />
        </svg>
      ) : null}
      <header className="auth-header">
        <Link href="/" className="auth-brand" aria-label="WorkNest home">
          <span className="auth-mark" aria-hidden="true">W</span>
          WorkNest
        </Link>
        <p className="auth-other">
          {other.lead} <Link href={other.href}>{other.label}</Link>
        </p>
      </header>
      <main id="main-content" className="auth-layout">
        <div className="auth-form">{children}</div>
        {variant === "register" ? (
          <aside className="auth-perks" aria-label="What you get">
            <p className="auth-eyebrow">What you get</p>
            <ul>
              {PERKS.map(([tone, text]) => (
                <li key={text}><span className="auth-dot" style={{ background: tone }} />{text}</li>
              ))}
            </ul>
            <p className="auth-note">Your records are visible only to you.</p>
          </aside>
        ) : null}
      </main>
    </div>
  );
}
