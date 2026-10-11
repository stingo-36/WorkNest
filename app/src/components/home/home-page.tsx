import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Book, Bulb, Cross, Dot, Globe, Pencil, PlaneTrail, Plus, Ring, Sparkle } from "@/components/home/doodles";
import { FeatureShowcase } from "@/components/home/feature-showcase";
import { RecapAvatar } from "@/components/home/recap-avatar";
import { ScreenMotion } from "@/components/home/screen-motion";
import { getCurrentUser } from "@/lib/session";

/**
 * Public homepage — built from the user's "Take it to the next level" banner:
 * a sturdy display serif (DM Serif Display), a dark word chip, a small italic
 * connector, an outlined pill CTA, a hand-drawn orange ring, outline doodles,
 * and four illustrated people standing in colour shapes.
 */

const STEPS = [
  { title: "Save it", copy: "Log your day, write a note, file a link or add a certificate the moment it happens." },
  { title: "Find it", copy: "Notes, resources, to-dos and favourites stay tagged, searchable and one click away." },
  { title: "Use it", copy: "Read a short AI summary of any day, look back on your achievements, or pull a report." },
];

const line = (i: number) => ({ "--i": i }) as CSSProperties;

/** Entrance item for ScreenMotion: plays each time its screen becomes active; `i` staggers it. */
function Anim({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  return <div data-anim className={className} style={{ "--i": i } as CSSProperties}>{children}</div>;
}

function Section({ id, labelledBy, className = "", children }: { id: string; labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`home-section ${className}`}>
      <div className="home-shell">{children}</div>
    </section>
  );
}

export async function HomePage() {
  const user = await getCurrentUser();
  const start = user ? "/tracker" : "/register";

  return (
    <div className="home">
      <a href="#main" className="home-skip">Skip to content</a>

      {/* Screen 1: header + hero fill exactly one viewport */}
      <div className="home-screen home-screen-hero">
      <header className="home-header home-shell">
        <Link href="/" className="home-brand">WorkNest</Link>
        <nav aria-label="Homepage" className="home-nav">
          <a href="#workspace">Workspace</a>
          <a href="#ai-summaries">AI summaries</a>
          <a href="#get-started">Get started</a>
        </nav>
        <Link href={user ? "/tracker" : "/login"} className="home-pill home-pill-solid">
          {user ? "Open workspace" : "Sign in"}
        </Link>
      </header>

      <main id="main" className="home-screen-hero-main">
        {/* ---------------------------------------------------------------- hero */}
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero-stage">
            <div className="home-hero-art" aria-hidden="true">
              <Plus className="dd dd-plus" />
              <Ring className="dd dd-ring-orange" />
              <Book className="dd dd-book" />
              <PlaneTrail className="dd dd-plane" />
              <Bulb className="dd dd-bulb" />
              <Pencil className="dd dd-pencil" />
              <Globe className="dd dd-globe" />
              <Cross className="dd dd-cross-red" />
              <Cross className="dd dd-cross-blue" />
              <Ring className="dd dd-ring-blue" />
              <Dot className="dd dd-dot dd-dot-1" />
              <Dot className="dd dd-dot dd-dot-2" />
              <Dot className="dd dd-dot dd-dot-3" />
              <Dot className="dd dd-dot dd-dot-4" />
              <Dot className="dd dd-dot dd-dot-5" />
              {/* The user's 3D characters (public/home/hero-1…4.webp, transparent cut-outs) */}
              {[1, 2, 3, 4].map((n) => (
                // eslint-disable-next-line @next/next/no-img-element -- static decorative cut-outs
                <img key={n} src={`/home/hero-${n}.webp`} alt="" draggable={false} className={`hero-person hero-person-${n}`} />
              ))}
            </div>

            <h1 id="hero-title" className="home-title">
              <span className="home-line home-line-1" style={line(0)}>Keep it</span>
              <span className="home-line home-line-2" style={line(1)}>
                <span className="home-chip"><span>all</span></span>
                <em>in</em>
                <Link href={start} className="home-pill home-pill-outline home-hero-cta">Let&apos;s start</Link>
              </span>
              <span className="home-line home-line-3" style={line(2)}>one</span>
              <span className="home-line home-line-4" style={line(3)}>
                place.
                <svg className="home-scribble" viewBox="0 0 220 220" aria-hidden="true">
                  <circle cx="110" cy="110" r="102" pathLength={1} />
                  <circle cx="176" cy="74" r="8" className="home-scribble-dot" />
                </svg>
              </span>
            </h1>
          </div>
        </section>
      </main>
      </div>

      <main className="home-rest">
        {/* ------------------------------------------------------------ features */}
        <Section id="workspace" labelledBy="features-title" className="home-features home-screen">
          <div className="home-head">
            <Anim><h2 id="features-title">Everything a working day <em>leaves behind.</em></h2></Anim>
            <Anim i={1}><p>Four places, each doing one job well. Nothing to set up first.</p></Anim>
          </div>
          <FeatureShowcase />
        </Section>

        {/* ------------------------------------------------------------ AI recap */}
        <Section id="ai-summaries" labelledBy="recap-title" className="home-recap home-screen">
          {/* Laid out like a "big headline + centre character" poster: headline and rule on
              top, then spines | 3D character | pitch + CTA. */}
          <div className="rc">
            <div className="rc-headline">
              <Anim><h2 id="recap-title">Let AI write <em>the recap.</em></h2></Anim>
            </div>
            <div className="rc-stage">
              <ol className="rc-spines">
                <li className="rc-spine rc-spine-1">
                  <Anim i={1}>
                    <div className="rc-spine-body">
                      <span className="rc-spine-title">Notes</span>
                      <span className="rc-spine-sub">01 · You jot it down</span>
                    </div>
                  </Anim>
                </li>
                <li className="rc-spine rc-spine-2">
                  <Anim i={2}>
                    <div className="rc-spine-body">
                      <span className="rc-spine-title">Summary</span>
                      <span className="rc-spine-sub">02 · AI sums up the day</span>
                      <Bulb className="rc-spine-doodle" aria-hidden="true" />
                    </div>
                  </Anim>
                </li>
                <li className="rc-sticker" aria-hidden="true"><Sparkles /> AI</li>
              </ol>
              <Anim i={2} className="rc-center">
                <span className="rc-glow" aria-hidden="true" />
                <RecapAvatar />
                <Sparkle className="rc-hero-spark" aria-hidden="true" />
              </Anim>
              <Anim i={3} className="rc-pitch">
                <p className="rc-pitch-title">Your day, summed up. Your 5-15, drafted.</p>
                <Link href={start} className="home-pill home-pill-solid home-pill-lg rc-cta">Start writing <ArrowRight aria-hidden="true" /></Link>
                <svg className="rc-squiggle" viewBox="0 0 120 320" fill="none" aria-hidden="true">
                  <path d="M8 316c10-60 30-120 44-150 10-22 26-30 22-6-6 34-30 70-20 80 12 12 40-60 58-150" pathLength={1} />
                </svg>
              </Anim>
            </div>
          </div>
        </Section>

        {/* Last screen: How it works + closing call to action + footer */}
        <div className="home-screen home-screen-end">
        {/* ---------------------------------------------------------- how it works */}
        <Section id="get-started" labelledBy="how-title" className="home-how">
          <div className="home-head">
            <Anim><h2 id="how-title">Save it once, <em>use it anytime.</em></h2></Anim>
          </div>
          <ol className="home-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className={`tone-${["purple", "blue", "orange"][index]}`}>
                <Anim i={index + 1}>
                  <span className="home-step-num" aria-hidden="true">0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </Anim>
              </li>
            ))}
          </ol>
        </Section>

        {/* ------------------------------------------------------------- closing */}
        <section className="home-cta" aria-labelledby="cta-title">
          <div className="home-cta-art" aria-hidden="true">
            <Plus className="dd dd-cta-plus" />
            <Ring className="dd dd-cta-ring" />
            <Cross className="dd dd-cta-cross" />
          </div>
          <div className="home-shell">
            <Anim i={4}><h2 id="cta-title">Ready when <em>you are.</em></h2></Anim>
            <Anim i={5}>
              <div className="home-cta-actions">
                <Link href={start} className="home-pill home-pill-solid home-pill-lg">
                  {user ? "Open your workspace" : "Create your space"} <ArrowRight aria-hidden="true" />
                </Link>
                {!user ? <Link href="/login" className="home-text-link">I already have an account</Link> : null}
              </div>
            </Anim>
          </div>
        </section>
      <footer className="home-footer">
        <div className="home-shell">
          <Link href="/" className="home-brand">WorkNest</Link>
          <nav aria-label="Footer">
            <a href="#workspace">Workspace</a>
            <a href="#ai-summaries">AI summaries</a>
            <a href="#get-started">Get started</a>
            <Link href="/login">Sign in</Link>
          </nav>
          <p>© 2026 WorkNest</p>
        </div>
      </footer>
        </div>
      </main>
      <ScreenMotion />
    </div>
  );
}
