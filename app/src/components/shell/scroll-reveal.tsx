"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/**
 * One-shot scroll reveals for the signed-in app.
 *
 * Mark an element `data-reveal` (it fades up once when it enters the viewport)
 * or a container `data-reveal-stagger` (each child does, cascading). Existing
 * `.scroll-reveal` / `.scroll-reveal-item` markup is picked up too.
 *
 * Why not the CSS scroll-timeline reveals the marketing pages use: inside the
 * app those left content stuck half-faded below the fold (see globals.css).
 * This can't strand anything:
 *   - it only ever HIDES an element that is below the fold right now, and only
 *     after IntersectionObserver exists to bring it back;
 *   - it reveals once and never hides again (no reverse on scroll-up);
 *   - on the very first paint nothing in view is touched — no flash of
 *     content fading out and back in after hydration;
 *   - new content (a tab switch, a section opened) cascades in as it mounts;
 *   - `prefers-reduced-motion` (and no JS) means everything is simply visible.
 */

const TARGETS = "[data-reveal], [data-reveal-stagger] > *, .scroll-reveal, .scroll-reveal-item";
/** Cap the cascade so a long list doesn't make the last row wait. */
const MAX_STAGGER = 8;

export function ScrollReveal() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.getElementById("main");
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const reveal = (element: Element) => {
      element.classList.remove("reveal-pending");
      element.classList.add("reveal-in");
    };

    const observer = new IntersectionObserver(
      (entries) => {
        // Elements entering together cascade in reading order.
        const entering = entries.filter((entry) => entry.isIntersecting);
        entering.forEach((entry, index) => {
          (entry.target as HTMLElement).style.setProperty("--reveal-i", String(Math.min(index, MAX_STAGGER)));
          reveal(entry.target);
          observer.unobserve(entry.target);
        });
      },
      // No negative margin: a small item at the very end of a page must still be able to trigger.
      { rootMargin: "0px", threshold: 0.01 },
    );

    /** `animateInView`: false on first paint (leave it alone), true for content that mounts later. */
    const scan = (animateInView: boolean) => {
      const fold = window.innerHeight;
      let inViewIndex = 0;
      root.querySelectorAll<HTMLElement>(TARGETS).forEach((element) => {
        if (element.dataset.revealSeen) return;
        const rect = element.getBoundingClientRect();
        // Not laid out yet (e.g. inside a Suspense boundary still streaming in,
        // which is display:none): its position is meaningless, so decide later.
        if (rect.width === 0 && rect.height === 0) return;
        element.dataset.revealSeen = "1";
        const top = rect.top;
        if (top < fold) {
          if (!animateInView) return;
          element.style.setProperty("--reveal-i", String(Math.min(inViewIndex++, MAX_STAGGER)));
          element.classList.add("reveal-in");
          return;
        }
        element.classList.add("reveal-pending");
        observer.observe(element);
      });
    };

    scan(false);

    // Content that appears without a navigation (tabs, sections, list updates).
    // Coalesced per frame — rAF still runs before that frame paints, so new
    // content is hidden before it is ever shown (no flicker), and typing in an
    // editor doesn't rescan on every keystroke.
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scan(true);
      });
    });
    // `style` too: React reveals a streamed Suspense boundary by clearing its
    // inline display:none, which is an attribute change, not a child change.
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden"] });

    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      // Undo, don't force-reveal: anything still waiting goes back to "unseen"
      // so the next run re-decides it. (React dev StrictMode runs this effect
      // twice; force-revealing here made every below-the-fold item pop in at
      // load.) Nothing is left hidden, because pending is removed either way.
      root.querySelectorAll<HTMLElement>(".reveal-pending").forEach((element) => {
        element.classList.remove("reveal-pending");
        delete element.dataset.revealSeen;
      });
    };
  }, [pathname]);

  return null;
}
