"use client";

import MenuItem from "@mui/material/MenuItem";
import MuiSelect, { type SelectChangeEvent } from "@mui/material/Select";
import OutlinedInput from "@mui/material/OutlinedInput";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { bandSx } from "@/components/ui/band-sx";

/**
 * Dropdown — MUI Select with a themed menu (ui/mui-provider.tsx).
 *
 * Call sites keep writing native-style `<option>` children and read
 * `event.target.value` in `onChange`; this maps each `<option>` to a MUI
 * `MenuItem` and hands back an event with the same shape.
 */
export type SelectProps = Omit<React.ComponentProps<"select">, "onChange"> & {
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  /** `band`: a nav-style pill for the slate page band. */
  tone?: "default" | "band";
};

type OptionElement = React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>;

function DropdownIcon(props: { className?: string }) {
  return <ChevronDown {...props} aria-hidden="true" style={{ width: 18, height: 18, right: 12 }} />;
}

export function Select({ className, children, id, name, value, defaultValue, onChange, disabled, required, tone = "default", ...rest }: SelectProps) {
  const options = React.Children.toArray(children).filter(React.isValidElement) as OptionElement[];
  return (
    <MuiSelect
      name={name}
      value={value as string | undefined}
      defaultValue={defaultValue as string | undefined}
      disabled={disabled}
      required={required}
      displayEmpty
      fullWidth
      className={className}
      input={<OutlinedInput sx={tone === "band" ? bandSx : undefined} />}
      IconComponent={DropdownIcon}
      onChange={(event: SelectChangeEvent<string>) => onChange?.({ target: { value: event.target.value, name } })}
      SelectDisplayProps={{
        id,
        "aria-label": rest["aria-label"],
        "aria-labelledby": rest["aria-label"] ? undefined : id ? `${id}-label` : undefined,
        "aria-describedby": rest["aria-describedby"],
      } as React.HTMLAttributes<HTMLDivElement>}
      MenuProps={{ disableScrollLock: true }}
    >
      {options.map((option) => (
        <MenuItem key={String(option.props.value)} value={option.props.value as string} disabled={option.props.disabled}>
          {option.props.children}
        </MenuItem>
      ))}
    </MuiSelect>
  );
}
