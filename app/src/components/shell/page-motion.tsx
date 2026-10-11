"use client";

import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { useLayoutEffect, useRef, type ReactNode } from "react";

type MotionFamily = "editorial" | "library" | "console" | "workflow" | "document" | "quiet";

function motionFamily(pathname: string): MotionFamily {
  if (pathname === "/tracker" || pathname.startsWith("/notes")) return "editorial";
  if (pathname === "/resources" || pathname === "/favourites") return "library";
  if (pathname === "/admin" || pathname === "/profile") return "console";
  if (pathname === "/tickets" || pathname === "/reports" || pathname === "/achievements") return "workflow";
  if (pathname.includes("/edit") || pathname.includes("/new")) return "document";
  return "quiet";
}

/**
 * Gives every authenticated route one calm entrance. The pathname key makes
 * client-side navigation replay the entrance without coupling pages to motion
 * code or delaying their content.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Most route components render one page root whose direct children are the
    // header and major content regions. Explicit reveal markup keeps richer
    // lists (Resources, Profile, Achievements) individually sequenced too.
    const candidates = root.querySelectorAll<HTMLElement>(
      ":scope > * > *, [data-reveal], [data-reveal-stagger] > *",
    );
    // Work Logs already has a bespoke date-card timeline. Closed dialogs and
    // editors should not consume stagger positions or animate unexpectedly.
    const items = Array.from(candidates).filter(
      (element) =>
        !element.closest(".work-logs-page") &&
        !element.closest('[data-motion="off"]') &&
        !element.matches("dialog"),
    );
    if (!items.length) return;

    const styles = getComputedStyle(document.documentElement);
    const distance = Number.parseFloat(styles.getPropertyValue("--distance-medium")) || 12;
    const family = motionFamily(pathname);
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { duration: 0.56, ease: "power3.out" } });
      const shared = { opacity: 0, y: -distance };

      if (family === "editorial") {
        timeline.fromTo(items, { ...shared, y: -distance * 1.25 }, { opacity: 1, y: 0, stagger: 0.09 });
      } else if (family === "library") {
        timeline.fromTo(items, { ...shared, scale: 0.975 }, { opacity: 1, y: 0, scale: 1, stagger: 0.075 });
      } else if (family === "console") {
        timeline.fromTo(items, { ...shared, x: -distance }, { opacity: 1, x: 0, y: 0, stagger: 0.085 });
      } else if (family === "workflow") {
        timeline.fromTo(
          items,
          { ...shared, x: (index: number) => (index % 2 ? distance : -distance) },
          { opacity: 1, x: 0, y: 0, stagger: 0.065 },
        );
      } else if (family === "document") {
        timeline.fromTo(items, { ...shared, scale: 0.99 }, { opacity: 1, y: 0, scale: 1, stagger: 0.1 });
      } else {
        timeline.fromTo(items, shared, { opacity: 1, y: 0, stagger: 0.08 });
      }
    }, root);

    return () => context.revert();
  }, [pathname]);

  return (
    <div
      key={pathname}
      ref={rootRef}
      className="app-page-motion min-w-0"
      data-motion-family={motionFamily(pathname)}
    >
      {children}
    </div>
  );
}
