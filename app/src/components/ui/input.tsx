"use client";

import InputAdornment from "@mui/material/InputAdornment";
import InputBase from "@mui/material/InputBase";
import OutlinedInput from "@mui/material/OutlinedInput";
import * as React from "react";

import { cn } from "@/components/cn";

/**
 * Text field — MUI OutlinedInput themed in `ui/mui-provider.tsx` (teal focus
 * border, token colours). Keeps the native `<input>` prop surface so call
 * sites are unchanged: layout props sit on the MUI root via `className`,
 * everything else (aria-*, maxLength, spellCheck, inputMode…) is forwarded to
 * the real `<input>`.
 *
 * `bare` renders an unstyled MUI InputBase for fields that live inside a
 * custom container (e.g. the work-log header's white `.wl-field` boxes).
 * `startIcon` / `endIcon` render as MUI adornments.
 *
 * Labels stay external via `<Field>` — never placeholder-only (a11y).
 */

/** Legacy native-input classes, still used by the Notes forms' `inputClass`. */
export const inputBase = cn(
  "w-full rounded-lg border border-border-strong bg-surface text-text",
  "font-medium placeholder:text-text-subtle",
  "transition-[color,background-color,border-color] duration-150 ease-standard",
  "hover:border-primary/60",
  "focus:border-primary focus:bg-surface",
  "aria-invalid:border-danger aria-invalid:hover:border-danger",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60",
);

export type InputProps = React.ComponentProps<"input"> & {
  bare?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
};

type FieldChange = React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
type FieldFocus = React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
type FieldKey = React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;

export function Input({
  className,
  type = "text",
  bare = false,
  startIcon,
  endIcon,
  ref,
  id,
  name,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  placeholder,
  disabled,
  readOnly,
  required,
  autoFocus,
  ...inputProps
}: InputProps) {
  const Control = bare ? InputBase : OutlinedInput;
  const invalid = inputProps["aria-invalid"] === true || inputProps["aria-invalid"] === "true";
  return (
    <Control
      inputRef={ref}
      id={id}
      name={name}
      type={type}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange as unknown as FieldChange}
      onBlur={onBlur as unknown as FieldFocus}
      onFocus={onFocus as unknown as FieldFocus}
      onKeyDown={onKeyDown as unknown as FieldKey}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      autoFocus={autoFocus}
      error={invalid}
      fullWidth
      className={className}
      startAdornment={startIcon ? <InputAdornment position="start" className="text-accent-text [&_svg]:size-4">{startIcon}</InputAdornment> : undefined}
      endAdornment={endIcon ? <InputAdornment position="end" className="text-accent-text [&_svg]:size-4">{endIcon}</InputAdornment> : undefined}
      inputProps={inputProps}
    />
  );
}
