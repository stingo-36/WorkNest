import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/components/cn";

/**
 * Button — design.md §7 (all five states), §9 (sizes).
 *
 * Flat: fills and 1px borders carry the hierarchy, never gradients or resting
 * shadows. The only depth cue is a 1px press translate, which is compositor-only
 * so it stays cheap on dense screens.
 *
 * Six variants, one job each:
 *   primary    the single committing action on a surface
 *   subtle     a teal-tinted secondary — same intent, less weight
 *   secondary  a neutral action that still needs an edge (Cancel, Back)
 *   outline    a neutral action on an already-busy surface
 *   ghost      a tertiary action in a row of controls
 *   danger     destructive, and never the default in a pair
 */
export const buttonVariants = cva(
  cn(
    "relative inline-flex cursor-pointer select-none items-center justify-center gap-2",
    "rounded-full font-semibold whitespace-nowrap",
    "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-standard",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        // `primary-strong` is the text-safe teal (5.3:1 on white); `--primary`
        // itself is reserved for large text and decorative fills.
        primary: cn(
          "bg-primary text-primary-fg shadow-button",
          "hover:bg-primary-hover active:bg-primary-active active:shadow-none",
        ),
        subtle: cn(
          "bg-primary-subtle text-accent-text",
          "hover:bg-primary-strong hover:text-primary-fg active:bg-primary-active active:text-primary-fg",
        ),
        secondary: cn(
          // Same 3:1 boundary rule as the form controls.
          "border border-border-strong bg-surface text-text shadow-xs",
          "hover:border-primary/60 hover:bg-surface-2 active:bg-surface-3",
        ),
        outline: cn(
          "border border-border-strong bg-transparent text-text-muted",
          "hover:border-primary hover:bg-primary-subtle hover:text-accent-text",
          "active:bg-surface-3",
        ),
        ghost:
          "bg-transparent text-text-muted hover:bg-surface-2 hover:text-text active:bg-surface-3",
        danger: cn(
          "bg-danger text-danger-fg shadow-xs",
          "hover:opacity-90 active:opacity-80",
        ),
      },
      size: {
        xs: "h-7 min-h-11 gap-1.5 rounded-full px-2 text-xs md:min-h-0 [&_svg]:size-3.5",
        sm: "h-8 min-h-11 gap-1.5 px-2.5 text-sm md:min-h-0 [&_svg]:size-4",
        md: "h-9 min-h-11 px-3.5 text-base md:min-h-0 [&_svg]:size-4",
        lg: "h-10 min-h-11 px-4 text-base md:min-h-0 [&_svg]:size-4",
      },
      iconOnly: {
        true: "px-0",
        false: "",
      },
      /** Fills its container — for the stacked action at the bottom of a form. */
      block: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      { size: "xs", iconOnly: true, class: "w-7 min-w-11 md:min-w-0" },
      { size: "sm", iconOnly: true, class: "w-8 min-w-11 md:min-w-0" },
      { size: "md", iconOnly: true, class: "w-9 min-w-11 md:min-w-0" },
      { size: "lg", iconOnly: true, class: "w-10 min-w-11 md:min-w-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      iconOnly: false,
      block: false,
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner and disables the button. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  iconOnly,
  block,
  loading = false,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, iconOnly, block }), className)}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
