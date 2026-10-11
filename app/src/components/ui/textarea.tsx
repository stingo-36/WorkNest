"use client";

import OutlinedInput from "@mui/material/OutlinedInput";
import * as React from "react";

/**
 * Long-form field — MUI multiline OutlinedInput, grows with its content from
 * `rows` lines. `text-md` (15px) prose size per design.md §6.
 */
export type TextareaProps = React.ComponentProps<"textarea">;

type AreaChange = React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
type AreaFocus = React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
type AreaKey = React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;

export function Textarea({ className, rows = 4, ref, id, name, value, defaultValue, onChange, onBlur, onKeyDown, placeholder, disabled, required, autoFocus, ...textareaProps }: TextareaProps) {
  return (
    <OutlinedInput
      multiline
      minRows={rows}
      inputRef={ref}
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange as unknown as AreaChange}
      onBlur={onBlur as unknown as AreaFocus}
      onKeyDown={onKeyDown as unknown as AreaKey}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      fullWidth
      className={className}
      sx={{ fontSize: "var(--text-md)", lineHeight: 1.6, alignItems: "flex-start" }}
      inputProps={textareaProps}
    />
  );
}
