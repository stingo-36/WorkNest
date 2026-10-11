"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The 3D character at the centre of the homepage AI recap section: a transparent cut-out
 * (public/home/recap-avatar.webp — the user's 3D character, cream background cut out;
 * replace the file to swap the character). It only fades in once loaded — no hover, tilt
 * or zoom (user decision). Until the file exists nothing renders, so there's never a
 * broken image. Decorative (alt="").
 */

const SRC = "/home/recap-avatar.webp";

export function RecapAvatar({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const img = useRef<HTMLImageElement>(null);

  // The server-rendered <img> can finish (or fail) before React attaches its handlers.
  useEffect(() => {
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth ? "ready" : "missing");
  }, []);

  if (state === "missing") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied file that may not exist yet; next/image would error on it
    <img
      ref={img}
      src={SRC}
      alt=""
      draggable={false}
      className={`rc-avatar ${className}${state === "ready" ? " is-ready" : ""}`}
      onLoad={() => setState("ready")}
      onError={() => setState("missing")}
    />
  );
}
