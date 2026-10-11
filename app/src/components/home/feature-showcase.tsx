"use client";

import { ArrowUpRight, Check, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type KeyboardEvent } from "react";

import { Book, Bulb, Calendar, Chain, Check as CheckMark, Clock, Cross, Dot, Globe, Pencil, PlaneTrail, Plus, Ring, Sparkle, StarMark } from "@/components/home/doodles";

/**
 * Homepage "Features": the four areas on the left; on the right their content laid
 * straight onto a tinted panel (no card), lines appearing one by one, with a big
 * matching doodle. Always auto-plays every 4s; picking a tab jumps there and the
 * cycle carries on from it (no autoplay under reduced motion). Accessible tabs:
 * arrow keys move between them. Previews are decorative (aria-hidden).
 */

const AREAS = [
  { id: "logs", tone: "purple", title: "Work logs", copy: "One page per day: meeting notes, the tickets you touched and what you got done. Saves as you type.", href: "/work-logs" },
  { id: "tracker", tone: "blue", title: "Tracker", copy: "To-dos with due dates and follow-ups you're waiting on, sorted into overdue, today and later.", href: "/tracker" },
  { id: "notes", tone: "pink", title: "Notes", copy: "Notebooks with sections and pages for decisions, drafts and ideas worth building.", href: "/notes" },
  { id: "resources", tone: "orange", title: "Resources", copy: "Docs, tools, commands and links in your own types — tagged, searchable, one click from favourites.", href: "/resources" },
] as const;

function LogsPreview() {
  return (
    <div className="fs-mock">
      <p className="fs-mock-title">Monday <span>Work day</span></p>
      <p className="fs-mock-label">Meetings</p>
      <div className="fs-row"><b>Team stand-up</b><span className="fs-line" style={{ width: "62%" }} /></div>
      <div className="fs-row"><b>Design review</b><span className="fs-line" style={{ width: "48%" }} /></div>
      <p className="fs-mock-label">Tickets</p>
      <div className="fs-row"><i className="fs-key tone-purple">TCK-101</i>Fix login redirect<em className="fs-pill fs-pill-blue">Sent to QA</em></div>
      <div className="fs-row"><i className="fs-key tone-orange">TCK-102</i>Update pricing page<em className="fs-pill">In progress</em></div>
      <div className="fs-ai"><Sparkles /> Sent TCK-101 to QA · stand-up notes done · 1 overdue</div>
    </div>
  );
}

function TrackerPreview() {
  return (
    <div className="fs-mock">
      <p className="fs-mock-title">Tracker <span>3 open</span></p>
      <p className="fs-mock-label fs-red">Overdue</p>
      <div className="fs-todo"><span />Fix broken images on the blog<em className="fs-date">Tue</em></div>
      <p className="fs-mock-label">Today</p>
      <div className="fs-todo is-done"><span><Check /></span>Prepare sprint demo</div>
      <div className="fs-todo"><span />Review the onboarding PR</div>
      <p className="fs-mock-label">Waiting on them</p>
      <div className="fs-row"><i className="fs-key tone-blue">Client</i>Final copy for the homepage<em className="fs-pill">Nudge Mon</em></div>
    </div>
  );
}

function NotesPreview() {
  return (
    <div className="fs-mock fs-mock-split">
      <div className="fs-side">
        <p className="fs-mock-label">Projects</p>
        <p className="fs-side-item is-on">Release plan</p>
        <p className="fs-side-item">Meeting notes</p>
        <p className="fs-mock-label">Ideas</p>
        <p className="fs-side-item">Side project</p>
      </div>
      <div className="fs-page">
        <p className="fs-mock-title">Release plan</p>
        <span className="fs-line" style={{ width: "92%" }} />
        <span className="fs-line" style={{ width: "84%" }} />
        <span className="fs-line" style={{ width: "70%" }} />
        <p className="fs-mock-label">Checklist</p>
        <div className="fs-todo is-done"><span><Check /></span>Freeze scope</div>
        <div className="fs-todo"><span />Write release notes</div>
      </div>
    </div>
  );
}

function ResourcesPreview() {
  return (
    <div className="fs-mock">
      <p className="fs-mock-title">Resources <span>21 saved</span></p>
      <p className="fs-chips"><i className="tone-purple">Docs</i><i className="tone-blue">Commands</i><i className="tone-orange">Tools</i><i className="tone-pink">Links</i></p>
      <div className="fs-res"><b>Team style guide</b><small>Docs · #design</small><Star className="is-fav" /></div>
      <div className="fs-res"><b>npm run build</b><small>Command · #deploy</small><Star /></div>
      <div className="fs-res"><b>Colour contrast checker</b><small>Tool · #accessibility</small><Star className="is-fav" /></div>
    </div>
  );
}

const PREVIEWS = { logs: LogsPreview, tracker: TrackerPreview, notes: NotesPreview, resources: ResourcesPreview };
// Each area's doodles: the big themed mark first (slot 0), then small accents that pop
// in around the preview. Slots are positioned and animated in home.css (.fs-d0–.fs-d4).
type Doodle = ComponentType<{ className?: string }>;
const DOODLES: Record<keyof typeof PREVIEWS, Doodle[]> = {
  logs: [Pencil, Calendar, Sparkle, Plus, Dot],
  tracker: [PlaneTrail, CheckMark, Clock, Ring, Dot],
  notes: [Book, Bulb, Sparkle, Cross, Ring],
  resources: [Globe, StarMark, Chain, Plus, Dot],
};

// One area's turn; also drives the progress bar's fill (passed as --fs-cycle)
const CYCLE_MS = 4000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  // Autoplay unless the visitor prefers reduced motion (server render: off).
  const autoplay = !useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => true);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  // Always cycling. Depending on `active` restarts the timer whenever the tab
  // changes, so a click carries on from the picked one.
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setTimeout(() => setActive((i) => (i + 1) % AREAS.length), CYCLE_MS);
    return () => window.clearTimeout(timer);
  }, [active, autoplay]);

  function pick(index: number) {
    setActive(index);
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + AREAS.length) % AREAS.length;
    pick(next);
    tabs.current[next]?.focus();
  }

  const area = AREAS[active];
  const Preview = PREVIEWS[area.id];
  const doodles = DOODLES[area.id];

  return (
    <div className="fs">
      {/* Full-screen tint behind the whole section on desktop: one layer per area so the
          colour cross-fades (gradients can't transition) */}
      {AREAS.map((item, index) => (
        <span key={`bg-${item.id}`} className={`fs-backdrop tone-${item.tone}${index === active ? " is-on" : ""}`} aria-hidden="true" />
      ))}
      <div data-anim style={{ "--i": 2 } as CSSProperties} className="fs-tabs" role="tablist" aria-label="WorkNest areas" aria-orientation="vertical">
        {AREAS.map((item, index) => {
          const selected = index === active;
          return (
            <button
              key={item.id}
              ref={(el) => { tabs.current[index] = el; }}
              type="button"
              role="tab"
              id={`fs-tab-${item.id}`}
              aria-selected={selected}
              aria-controls="fs-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => pick(index)}
              onKeyDown={(event) => onKey(event, index)}
              className={`fs-tab tone-${item.tone}${selected ? " is-active" : ""}`}
            >
              <span className="fs-num">0{index + 1}</span>
              <span className="fs-tab-body">
                <span className="fs-tab-title">{item.title}</span>
                <span className="fs-tab-copy">{item.copy}</span>
              </span>
              {/* Progress bar for the auto-advance */}
              {selected && autoplay ? <span key={`p-${active}`} className="fs-progress" style={{ "--fs-cycle": `${CYCLE_MS}ms` } as CSSProperties} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div data-anim style={{ "--i": 3 } as CSSProperties} id="fs-panel" role="tabpanel" aria-labelledby={`fs-tab-${area.id}`} className={`fs-panel tone-${area.tone}`}>
        {doodles.map((Mark, slot) => <Mark key={`d-${area.id}-${slot}`} className={`fs-doodle fs-d${slot}`} />)}
        <div key={area.id} className="fs-stage" aria-hidden="true"><Preview /></div>
        <Link href={area.href} className="fs-open">Open {area.title.toLowerCase()} <ArrowUpRight aria-hidden="true" /></Link>
      </div>
    </div>
  );
}
