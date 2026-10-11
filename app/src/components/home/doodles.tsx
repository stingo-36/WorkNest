import type { ReactNode, SVGProps } from "react";

/**
 * Hand-drawn style marks for the homepage (the banner's pluses, rings, crosses,
 * book, paper plane, bulb, pencil, globe, plus the feature marks: calendar, check,
 * clock, star, chain, sparkle). Decorative only — every one is
 * aria-hidden. Colour comes from `currentColor`, set by the CSS class.
 */

type Props = SVGProps<SVGSVGElement>;

function Svg({ children, viewBox = "0 0 48 48", ...props }: Props & { children: ReactNode }) {
  return (
    <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export const Plus = (p: Props) => <Svg strokeWidth={7} {...p}><path d="M24 8v32M8 22l32 4" /></Svg>;
export const Ring = (p: Props) => <Svg strokeWidth={4} {...p}><circle cx="24" cy="24" r="17" /></Svg>;
export const Cross = (p: Props) => <Svg strokeWidth={6} {...p}><path d="M11 11l26 26M37 11L11 37" /></Svg>;
export const Dot = (p: Props) => <Svg {...p}><circle cx="24" cy="24" r="24" fill="currentColor" stroke="none" /></Svg>;

export const Book = (p: Props) => (
  <Svg strokeWidth={1.6} viewBox="0 0 96 96" {...p}>
    <path d="M14 58l30-36 38 14-30 38z" />
    <path d="M44 22l8 52M14 58l8 18 30-2" />
    <path d="M52 30l20 7M55 38l20 7M58 46l14 5M30 44l8-9M27 52l8-9M24 60l8-9" />
  </Svg>
);

export const Bulb = (p: Props) => (
  <Svg strokeWidth={1.6} viewBox="0 0 48 64" {...p}>
    <path d="M16 38c-5-4-7-9-7-14a15 15 0 0130 0c0 5-2 10-7 14v6H16z" />
    <path d="M17 50h14M18 55h12M21 60h6M24 2v4M8 8l3 3M40 8l-3 3M2 24h4M42 24h4" />
  </Svg>
);

export const Pencil = (p: Props) => (
  <Svg strokeWidth={1.6} viewBox="0 0 64 64" {...p}>
    <path d="M10 54l4-14 34-34 10 10-34 34z" />
    <path d="M40 14l10 10M14 40l10 10M10 54l8-2" />
  </Svg>
);

export const Globe = (p: Props) => (
  <Svg strokeWidth={1.6} viewBox="0 0 96 96" {...p}>
    <circle cx="54" cy="46" r="30" />
    <path d="M24 46h60M54 16c-10 9-10 51 0 60M54 16c10 9 10 51 0 60M30 30h48M30 62h48" />
    <path d="M18 28v36M12 46h12" />
  </Svg>
);

export const Calendar = (p: Props) => (
  <Svg strokeWidth={1.8} viewBox="0 0 64 64" {...p}>
    <path d="M10 16c14-2 30-2 44 0l-2 38c-13 2-27 2-40 0z" />
    <path d="M11 27h42M22 9v12M42 9v12M21 37h4M31 37h4M41 37h3M21 46h4M31 46h4" />
  </Svg>
);

export const Check = (p: Props) => (
  <Svg strokeWidth={2} viewBox="0 0 64 64" {...p}>
    <path d="M32 6c15 0 26 11 26 26S47 58 32 58 6 47 6 32c0-9 4-16 10-21" />
    <path d="M20 33l9 9 17-20" />
  </Svg>
);

export const Clock = (p: Props) => (
  <Svg strokeWidth={1.8} viewBox="0 0 64 64" {...p}>
    <circle cx="32" cy="34" r="23" />
    <path d="M32 20v15l10 6M26 6h12M32 6v5M52 12l4 4" />
  </Svg>
);

export const StarMark = (p: Props) => (
  <Svg strokeWidth={1.8} viewBox="0 0 64 64" {...p}>
    <path d="M32 6l7 17 18 2-14 12 5 19-16-10-16 10 5-19L7 25l18-2z" />
  </Svg>
);

export const Chain = (p: Props) => (
  <Svg strokeWidth={2} viewBox="0 0 64 64" {...p}>
    <path d="M28 36a10 10 0 0014 1l9-9a10 10 0 00-14-14l-4 4" />
    <path d="M36 28a10 10 0 00-14-1l-9 9a10 10 0 0014 14l4-4" />
  </Svg>
);

export const Sparkle = (p: Props) => (
  <Svg strokeWidth={2} viewBox="0 0 48 48" {...p}>
    <path d="M24 4c1 11 5 16 18 20-13 3-17 8-18 20-2-12-6-17-18-20 12-4 16-9 18-20z" />
  </Svg>
);

/** The paper plane at the end of a dashed loop — the loop's dashes march slowly. */
export const PlaneTrail = (p: Props) => (
  <Svg strokeWidth={1.6} viewBox="0 0 200 110" {...p}>
    <path className="home-trail" d="M4 96c34 8 70 4 92-14 26-22 18-62-10-64-26-2-36 30-14 46 26 18 64 6 86-30" strokeDasharray="5 6" />
    <path d="M156 18l38-6-22 34-6-16z M166 30l28-18" />
  </Svg>
);
