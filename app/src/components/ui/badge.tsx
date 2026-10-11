import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/components/cn";

/**
 * Generic badge. 20px tall, `px-2`, 13px/500 (design.md §9/§10).
 * Ticket statuses use `<TicketStatusBadge>`, not this.
 */
export const badgeVariants = cva(
  "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        // Tinted fill + a border in the tone colour so the capsule reads on
        // white and on tinted cards alike. Labels all clear 4.5:1.
        neutral: "border-accent-text/35 bg-card-navy text-accent-text",
        primary: "border-primary/45 bg-primary-subtle text-accent-text",
        danger: "border-danger/45 bg-danger-subtle text-danger",
        success: "border-success/45 bg-success-subtle text-success",
        warning: "border-warning/45 bg-warning-subtle text-warning",
        info: "border-info/45 bg-info-subtle text-info",
      },
      outline: {
        true: "border bg-transparent",
        false: "",
      },
    },
    compoundVariants: [
      { tone: "neutral", outline: true, class: "border-accent-text" },
      { tone: "primary", outline: true, class: "border-primary" },
      { tone: "danger", outline: true, class: "border-danger" },
      { tone: "success", outline: true, class: "border-success" },
      { tone: "warning", outline: true, class: "border-warning" },
      { tone: "info", outline: true, class: "border-info" },
    ],
    defaultVariants: { tone: "neutral", outline: false },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, outline, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, outline }), className)} {...props} />
  );
}

/**
 * A ticket key like `ASU-1234`. Mono, 13px, weight 500 — everywhere, without
 * exception (design.md §10).
 */
export function TicketId({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-mono text-sm font-medium text-text", className)}
      {...props}
    >
      {children}
    </span>
  );
}
