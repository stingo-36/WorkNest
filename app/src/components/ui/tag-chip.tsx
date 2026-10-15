import { cn } from "@/components/cn";
import { tagColor, tagTextTone } from "@/lib/tag-colors";

/**
 * A tag as a solid coloured capsule (owner, 2026-10-15: no pastels). The fill is
 * `tagColor` (brand colour for known tags, else a stable hue); the label is white
 * or ink, whichever contrasts more with that fill.
 */
export function tagChipStyle(tag: string): React.CSSProperties {
  const color = tagColor(tag);
  return {
    "--tag": color,
    "--tag-fg": tagTextTone(color) === "light" ? "var(--c-primary-fg)" : "var(--c-text)",
  } as React.CSSProperties;
}

export const tagChipClass =
  "inline-flex items-center gap-1 rounded-full bg-[var(--tag)] px-2.5 py-0.5 font-mono text-sm font-semibold text-[var(--tag-fg)]";

export function TagChip({ tag, count, className }: { tag: string; count?: number; className?: string }) {
  return (
    <span style={tagChipStyle(tag)} className={cn(tagChipClass, className)}>
      #{tag}
      {count !== undefined ? <span className="tabular-nums opacity-80">{count}</span> : null}
    </span>
  );
}
