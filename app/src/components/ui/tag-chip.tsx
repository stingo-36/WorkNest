import { cn } from "@/components/cn";
import { tagColor } from "@/lib/tag-colors";

/**
 * A tag as a coloured capsule. The colour comes from `tagColor` (brand colour
 * for known tags, else a stable hue) and is only used mixed: a pale fill, a
 * soft edge and dark text, so every tag stays readable on the page tint.
 */
export function tagChipStyle(tag: string): React.CSSProperties {
  return { "--tag": tagColor(tag) } as React.CSSProperties;
}

export const tagChipClass =
  "inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--tag)_35%,transparent)] bg-[color-mix(in_srgb,var(--tag)_14%,var(--c-surface))] px-2.5 py-0.5 font-mono text-sm font-medium text-[color-mix(in_srgb,var(--tag)_40%,var(--c-text))]";

export function TagChip({ tag, count, className }: { tag: string; count?: number; className?: string }) {
  return (
    <span style={tagChipStyle(tag)} className={cn(tagChipClass, className)}>
      #{tag}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
    </span>
  );
}
