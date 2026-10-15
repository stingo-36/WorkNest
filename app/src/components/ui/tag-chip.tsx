import { cn } from "@/components/cn";
import { tagColor } from "@/lib/tag-colors";

/**
 * A tag as coloured text — no fill (owner, 2026-10-15: the solid capsules looked
 * heavy). The colour is `tagColor` (brand colour for known tags, else a stable
 * hue), mixed half-and-half with the ink text so light brands (Android green,
 * JavaScript yellow) still read on the page tint.
 */
export function tagChipStyle(tag: string): React.CSSProperties {
  return { "--tag": tagColor(tag) } as React.CSSProperties;
}

export const tagChipClass =
  "inline-flex items-center gap-1 font-mono text-sm font-semibold text-[color-mix(in_srgb,var(--tag)_50%,var(--c-text))]";

export function TagChip({ tag, count, className }: { tag: string; count?: number; className?: string }) {
  return (
    <span style={tagChipStyle(tag)} className={cn(tagChipClass, className)}>
      #{tag}
      {count !== undefined ? <span className="font-medium text-text-muted tabular-nums">{count}</span> : null}
    </span>
  );
}
