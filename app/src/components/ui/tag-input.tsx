"use client";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { Tag } from "lucide-react";
import { useState } from "react";

/** The server keeps at most this many tags (`tagsSchema` in lib/validation.ts). */
const MAX_TAGS = 25;

/** One tag as stored: trimmed, lowercase, no leading "#", spaces become dashes. */
export function normalizeTag(raw: string) {
  return raw.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-");
}

/** Adds tags to a list, skipping blanks and duplicates, up to MAX_TAGS. */
function addTags(current: string[], raw: string[]) {
  const next = [...current];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (tag && !next.includes(tag) && next.length < MAX_TAGS) next.push(tag);
  }
  return next;
}

/**
 * Tags field with search — MUI Autocomplete (multiple + freeSolo) over the
 * tags you have already used, so the same tag is picked instead of retyped
 * with a new spelling. Type to filter; click (or ↓ + Enter) picks a saved tag;
 * Enter or a comma adds what you typed; Backspace in an empty field removes
 * the last one. Tags are normalised, so "AWS" and "#aws" match "aws". Anything
 * still typed when the field loses focus is added, so Save never drops it.
 */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder = "Search or add tags",
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Existing tags, most used first. */
  suggestions: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function commitInput() {
    if (!input.trim()) return;
    onChange(addTags(value, [input]));
    setInput("");
  }

  return (
    <Autocomplete<string, true, false, true>
      id={id}
      multiple
      freeSolo
      filterSelectedOptions
      // No autoHighlight: in freeSolo, Enter commits the typed text (MUI 9), so a
      // pre-highlighted suggestion would suggest the wrong thing. ↓ then Enter,
      // or a click, picks a suggestion.
      value={value}
      options={suggestions}
      inputValue={input}
      onInputChange={(_event, next, reason) => {
        if (reason === "reset") return;
        // A comma finishes a tag: add everything before it, keep the rest typed.
        if (next.includes(",")) {
          const parts = next.split(",");
          const rest = parts.pop() ?? "";
          onChange(addTags(value, parts));
          setInput(rest.trimStart());
          return;
        }
        setInput(next);
      }}
      onChange={(_event, next) => {
        onChange(addTags([], next));
        setInput("");
      }}
      noOptionsText={input.trim() ? `Press Enter to add “${normalizeTag(input)}”` : "No saved tags yet — type one"}
      slotProps={{
        chip: {
          size: "small",
          sx: {
            height: 24,
            borderRadius: "9999px",
            backgroundColor: "var(--c-primary-subtle)",
            color: "var(--c-accent-text)",
            fontWeight: 600,
            fontSize: "var(--text-xs)",
            "& .MuiChip-deleteIcon": { color: "var(--c-accent-text)", opacity: 0.7, fontSize: 16 },
            "& .MuiChip-deleteIcon:hover": { color: "var(--c-accent-text)", opacity: 1 },
          },
        },
      }}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props}>
          <span className="text-text-subtle">#</span>
          {option}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={value.length ? undefined : placeholder}
          onBlur={commitInput}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <>
                  <Tag aria-hidden="true" className="ml-1 size-4 shrink-0 text-accent-text" />
                  {params.slotProps.input.startAdornment}
                </>
              ),
            },
            htmlInput: { ...params.slotProps.htmlInput, maxLength: 60 },
          }}
        />
      )}
    />
  );
}
