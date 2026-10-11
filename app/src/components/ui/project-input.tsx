"use client";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { Building2 } from "lucide-react";
import { useRef, useState } from "react";

import { listProjects } from "@/actions/tickets";

/**
 * Project / site field with autocomplete — suggests project names already used
 * on the user's tickets (MUI Autocomplete, freeSolo so a new name can still be
 * typed). Suggestions load when the field is first opened; names committed
 * here are added straight away.
 *
 * `onCommit` fires when the user picks a suggestion, presses Enter, or leaves
 * the field — callers that autosave hang their save on it.
 */

/**
 * No module-level cache on purpose: module state survives client-side sign-out
 * / sign-in, which would leak one account's project names to the next. Each
 * field loads the list from the server (scoped to the signed-in user) on open.
 */

export function ProjectInput({
  id,
  value,
  onValueChange,
  onCommit,
  disabled,
  placeholder = "e.g. ASU Online",
}: {
  id: string;
  value: string;
  onValueChange: (next: string) => void;
  onCommit?: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Last value handed to onCommit — picking a suggestion and then leaving the
  // field must not save twice, and leaving an untouched field must not save.
  const lastCommitted = useRef(value.trim());

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === lastCommitted.current) return;
    lastCommitted.current = trimmed;
    if (trimmed && options && !options.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setOptions([...options, trimmed].sort((a, b) => a.localeCompare(b)));
    }
    onCommit?.(trimmed);
  }

  return (
    <Autocomplete<string, false, false, true>
      id={id}
      freeSolo
      value={null}
      inputValue={value}
      options={(options ?? []).filter((option) => option.toLowerCase() !== value.trim().toLowerCase())}
      loading={loading}
      disabled={disabled}
      onOpen={() => {
        if (options) return;
        setLoading(true);
        void listProjects().then((result) => {
          setOptions(result.ok ? result.data : []);
          setLoading(false);
        });
      }}
      onInputChange={(_event, next, reason) => {
        if (reason === "reset") return;
        onValueChange(next);
      }}
      onChange={(_event, next, reason) => {
        if (typeof next !== "string" && next !== null) return;
        if (reason === "selectOption" && next) {
          onValueChange(next);
          commit(next);
        } else if (reason === "createOption") {
          commit(value);
        }
      }}
      noOptionsText="No saved projects yet — type a new one"
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          onBlur={() => commit(value)}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: <Building2 aria-hidden="true" className="ml-1 size-4 shrink-0 text-accent-text" />,
            },
            htmlInput: { ...params.slotProps.htmlInput, maxLength: 160 },
          }}
        />
      )}
    />
  );
}
