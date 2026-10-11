"use client";

import { Tag } from "lucide-react";
import { useEffect, useState } from "react";

import { NoteIcon } from "@/components/notes/NoteIcon";
import { isLightColor, noteAccent } from "@/lib/note-colors";
import { ICON_ALIASES, loadIconIndex, type IconEntry, type IconIndex } from "@/lib/note-icons";

/**
 * A tag's "own" icon, in colour: `vercel` → the Vercel logo, `ai` / `docs` /
 * `design` → their alias icons, `drupal` → the Drupal drop in Drupal blue.
 *
 * Nothing is stored — the icon is derived from the tag text with the same
 * icon index and brand palette the Notes icon picker uses. Only confident
 * matches count (an alias, or an icon whose name equals the tag); anything looser keeps a tag glyph, so `skills` never gets a random
 * logo. Brand icons use their brand colour; the rest get a stable colour per
 * tag, so the same tag looks the same everywhere.
 */

let index: IconIndex | null = null;
const matchCache = new Map<string, IconEntry | null>();

function bestIcon(idx: IconIndex, tag: string): IconEntry | null {
  const cached = matchCache.get(tag);
  if (cached !== undefined) return cached;

  const q = tag.toLowerCase().replace(/-/g, " ").trim();
  const compact = q.replace(/\s+/g, "");
  let found: IconEntry | null = null;

  for (const id of ICON_ALIASES[q] ?? ICON_ALIASES[compact] ?? []) {
    const entry = idx.byId.get(id);
    if (entry) { found = entry; break; }
  }
  if (!found) {
    // Brand icons first (that's what "original" means for a tool name), then the rest.
    // Exact names only — a prefix match turned `skills` into the Skillshare logo.
    const exact = (entry: IconEntry) => entry.slug === compact || entry.labelLower === q;
    found = idx.entries.find((entry) => entry.library === "si" && exact(entry)) ?? idx.entries.find((entry) => exact(entry)) ?? null;
  }
  matchCache.set(tag, found);
  return found;
}

/** Brand colours that are too pale on white (JS yellow) get deepened. */
function readable(hex: string) {
  return isLightColor(hex) ? `color-mix(in srgb, ${hex} 55%, black)` : hex;
}

export function TagIcon({ tag, className = "size-3.5" }: { tag: string; className?: string }) {
  const [, setLoaded] = useState(index !== null);

  useEffect(() => {
    if (index) return;
    let active = true;
    void loadIconIndex().then((loaded) => {
      index = loaded;
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const entry = index ? bestIcon(index, tag) : null;
  const color = readable(noteAccent(entry?.name, tag));
  const fallback = <Tag className={className} style={{ color }} aria-hidden="true" />;

  if (!entry) return fallback;
  return (
    <span style={{ color }} className="inline-flex shrink-0">
      <NoteIcon icon={{ library: entry.library, name: entry.name }} className={className} fallback={fallback} />
    </span>
  );
}
