import type { SxProps, Theme } from "@mui/material/styles";

/**
 * MUI field styling for the slate page band (`components/shell/page-band.tsx`):
 * a pill like the nav's idle links. Colours read the band's re-pointed
 * `--c-sidebar-*` tokens, so they always match the nav.
 */
export const bandSx: SxProps<Theme> = {
  height: 44,
  borderRadius: "999px",
  // The theme gives fields a white surface; on the band they're see-through like nav pills.
  backgroundColor: "transparent !important",
  color: "var(--c-sidebar-fg)",
  fontSize: "0.875rem",
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-sidebar-border)" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-sidebar-muted)" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-sidebar-fg)", borderWidth: 2 },
  "& input": { colorScheme: "dark", paddingLeft: "16px" },
  "& input::placeholder": { color: "var(--c-sidebar-muted)", opacity: 1 },
  "& .MuiSelect-select": { paddingLeft: "16px" },
  "& .MuiSelect-icon, & .MuiInputAdornment-root": { color: "var(--c-sidebar-muted)" },
};
