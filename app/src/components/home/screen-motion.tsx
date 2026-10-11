"use client";

import { useEffect } from "react";

/**
 * Homepage scroll motion, one system for every full-screen section (`.home-screen`).
 * A section becomes active when it's well into view and inactive only once it has fully
 * left, so its entrance plays every time you arrive — scrolling down or back up — and
 * resets off-screen where nobody sees it. `data-dir` records the direction you arrived
 * from, so content rises when scrolling down and drops in when scrolling up.
 *
 * Content is visible by default (server render, no JS, reduced motion); hiding is only
 * armed (`data-motion` on `.home`) after the sections already on screen are marked active,
 * so nothing on screen ever flashes out. CSS lives in `(marketing)/home.css`.
 */
export function ScreenMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".home");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const screens = Array.from(root.querySelectorAll<HTMLElement>(".home-screen"));

    let lastY = window.scrollY;
    let dir: "down" | "up" = "down";
    const onScroll = () => {
      const y = window.scrollY;
      if (y !== lastY) dir = y > lastY ? "down" : "up";
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const activate = (el: HTMLElement) => {
      if (el.hasAttribute("data-active")) return;
      // Set the direction, force a style flush so the hidden start offset matches it, then
      // activate — the entrance transitions from that offset.
      el.dataset.dir = dir;
      void el.offsetHeight;
      el.setAttribute("data-active", "");
    };

    // Arrive: the section comes 12% into the viewport from either edge.
    const enter = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && activate(e.target as HTMLElement)),
      { rootMargin: "-12% 0px -12% 0px" },
    );
    // Leave: the section is completely off-screen — reset it for next time.
    const leave = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        // A screen edge-adjacent to the viewport still counts as "intersecting" (ratio 0),
        // so treat under 2% visible as gone.
        if (e.isIntersecting && e.intersectionRatio > 0.02) return;
        e.target.removeAttribute("data-active");
      }),
      { threshold: [0, 0.02] },
    );

    // Mark what's already on screen first, then arm the hidden start states.
    const vh = window.innerHeight;
    for (const el of screens) {
      const box = el.getBoundingClientRect();
      if (box.bottom > vh * 0.12 && box.top < vh * 0.88) el.setAttribute("data-active", "");
      enter.observe(el);
      leave.observe(el);
    }
    root.setAttribute("data-motion", "");

    return () => {
      window.removeEventListener("scroll", onScroll);
      enter.disconnect();
      leave.disconnect();
      root.removeAttribute("data-motion");
      for (const el of screens) el.removeAttribute("data-active");
    };
  }, []);

  return null;
}
