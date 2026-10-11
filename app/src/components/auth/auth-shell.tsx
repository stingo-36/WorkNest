import Link from "next/link";
import type { ReactNode } from "react";

import { Cross, PlaneTrail, Plus, Ring } from "@/components/home/doodles";

/**
 * Login / register frame — one screen, no scrolling, no cards. The form sits
 * straight on the page; beside it a single colour panel with the 3D character
 * (bean bag + laptop on login, clipboard on register — public/home/auth-*.webp,
 * cut from the user's render), a serif line and three plain points about what's waiting. Panel is decorative
 * (aria-hidden); the form's h1 is the page heading.
 */

const SCENES: Record<"login" | "register", { image: string; line: [string, string, string]; points: Array<[string, string]> }> = {
  login: {
    image: "/home/auth-login.webp",
    line: ["Your desk,", "exactly", "as you left it."],
    points: [
      ["purple", "Today's work log, open where you stopped"],
      ["blue", "To-dos and follow-ups sorted by when they're due"],
      ["orange", "An AI summary of any day, when you want one"],
    ],
  },
  register: {
    image: "/home/auth-register.webp",
    line: ["Four places.", "One", "quiet workspace."],
    points: [
      ["purple", "Work logs for meetings, tickets and what you did"],
      ["blue", "A tracker for to-dos and follow-ups"],
      ["orange", "Notes and resources, searchable and tagged"],
    ],
  },
};

export function AuthShell({ variant, children }: { variant: "login" | "register"; children: ReactNode }) {
  const scene = SCENES[variant];
  const other = variant === "login" ? { href: "/register", label: "Create account" } : { href: "/login", label: "Sign in" };

  return (
    <div className={`auth-shell auth-shell-${variant}`}>
      <main id="main-content" className="auth-layout">
        <section className="auth-form-panel" aria-label={variant === "login" ? "Sign in" : "Create account"}>
          <header className="auth-header">
            <Link href="/" className="auth-brand" aria-label="WorkNest home">WorkNest</Link>
          </header>
          <div className="auth-form">{children}</div>
        </section>

        <aside className="auth-art">
          <Link href={other.href} className="auth-switch">{other.label}</Link>
          <div className="auth-panel" aria-hidden="true">
            <Plus className="dd auth-dd-1" />
            <Ring className="dd auth-dd-2" />
            <Cross className="dd auth-dd-3" />
            <PlaneTrail className="dd auth-dd-4" />
            {/* eslint-disable-next-line @next/next/no-img-element -- static transparent cut-out; decorative */}
            <img src={scene.image} alt="" draggable={false} className="auth-hero-person" />
            <p className="auth-statement">{scene.line[0]} <em>{scene.line[1]}</em> {scene.line[2]}</p>
            <ul className="auth-points">
              {scene.points.map(([tone, text]) => (
                <li key={text}><span className={`auth-dot tone-${tone}`} />{text}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
