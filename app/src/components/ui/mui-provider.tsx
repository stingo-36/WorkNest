"use client";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { ReactNode } from "react";

/**
 * MUI for form fields (Input / Select / Textarea / Autocomplete).
 *
 * The palette carries concrete hexes because MUI computes alphas from them;
 * every visible surface/border/text in the overrides reads our CSS tokens
 * instead, so fields follow the app palette AND flip with `.dark` for free.
 *
 * `enableCssLayer` puts MUI in `@layer mui` (declared first in globals.css),
 * so Tailwind utilities passed via `className` still win.
 */
/**
 * Where MUI popups (Autocomplete lists, Select menus) are portalled.
 *
 * MUI portals to <body>, but our Modal / ConfirmationDialog are native
 * `<dialog>`s opened with showModal(), which puts them in the browser's top
 * layer ABOVE everything in <body> — so a dropdown inside a popup opened
 * invisibly behind it. Portal into the open modal dialog instead (the last one
 * when nested). Outside a dialog, portal into `.app-shell` so popups still
 * inherit the workspace tokens that are scoped there; <body> only as a last
 * resort.
 */
function portalContainer(): HTMLElement {
  const open = document.querySelectorAll<HTMLDialogElement>("dialog:modal");
  return open[open.length - 1] ?? document.querySelector<HTMLElement>(".app-shell") ?? document.body;
}

const theme = createTheme({
  palette: {
    primary: { main: "#13706a", contrastText: "#ffffff" },
    secondary: { main: "#0f2b2a", contrastText: "#ffffff" },
    text: { primary: "#102826", secondary: "#4a5d5a" },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: "inherit" },
  components: {
    // `fixed` so a list inside a dialog is placed against the viewport and not
    // clipped by the dialog's `overflow: hidden`.
    MuiPopper: { defaultProps: { container: portalContainer, popperOptions: { strategy: "fixed" } } },
    MuiPopover: { defaultProps: { container: portalContainer } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--c-surface)",
          color: "var(--c-text)",
          fontSize: "var(--text-base)",
          fontWeight: 500,
          transition: "box-shadow var(--duration-quick) ease-out",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-border-strong)", transition: "border-color var(--duration-quick) ease-out" },
          "&:hover:not(.Mui-disabled):not(.Mui-focused) .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-primary)" },
          "&.Mui-focused": { boxShadow: "var(--sh-focus)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-primary)", borderWidth: 2 },
          "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: "var(--c-danger)" },
          "&.Mui-disabled": { backgroundColor: "var(--c-surface-2)", opacity: 0.7 },
        },
        input: {
          padding: "10px 14px",
          "&::placeholder": { color: "var(--c-text-subtle)", opacity: 1 },
        },
        // The root pads a multiline field; padding the <textarea> as well
        // doubled it and pushed text/placeholders ~28px in from the edge.
        multiline: { padding: "10px 14px", "& textarea": { padding: 0 } },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontFamily: "inherit", color: "var(--c-text)" },
        input: { "&::placeholder": { color: "var(--c-text-subtle)", opacity: 1 } },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: { color: "var(--c-accent-text)" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundColor: "var(--c-surface)", color: "var(--c-text)", backgroundImage: "none" },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          marginTop: 6,
          border: "1px solid var(--c-border)",
          borderRadius: 12,
          boxShadow: "0 12px 32px -8px rgba(40, 75, 99, 0.28)",
        },
        list: { padding: 6 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontSize: "var(--text-base)",
          fontWeight: 500,
          minHeight: 38,
          "&:hover": { backgroundColor: "var(--c-surface-2)" },
          "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: "var(--c-primary-subtle)", color: "var(--c-accent-text)", fontWeight: 600 },
          "&.Mui-focusVisible": { backgroundColor: "var(--c-surface-3)" },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          marginTop: 6,
          border: "1px solid var(--c-border)",
          borderRadius: 12,
          boxShadow: "0 12px 32px -8px rgba(40, 75, 99, 0.28)",
        },
        listbox: {
          padding: 6,
          "& .MuiAutocomplete-option": { borderRadius: 8, minHeight: 40 },
          "& .MuiAutocomplete-option.Mui-focused": { backgroundColor: "var(--c-surface-2)" },
          "& .MuiAutocomplete-option[aria-selected='true']": { backgroundColor: "var(--c-primary-subtle)" },
        },
        noOptions: { color: "var(--c-text-muted)", fontSize: "var(--text-sm)" },
      },
    },
  },
});

export function MuiProvider({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui", enableCssLayer: true }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  );
}
