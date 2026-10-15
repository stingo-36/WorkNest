/**
 * How a resource type is named on screen. Shared by the Resources page and the
 * Profile list (client + server), so no `server-only`.
 */

/** Built-in types keep their plural. Icons: see `components/resources/type-icon.tsx`. */
const BUILT_IN_META: Record<string, { label: string; plural: string }> = {
  Website: { label: "Website", plural: "Websites" },
  App: { label: "App", plural: "Apps" },
  Link: { label: "Link", plural: "Links" },
  Tool: { label: "Tool", plural: "Tools" },
  Command: { label: "Command", plural: "Commands" },
  Documentation: { label: "Documentation", plural: "Documentation" },
  Snippet: { label: "Snippet", plural: "Snippets" },
  Reference: { label: "Reference", plural: "References" },
  Learning: { label: "Learning", plural: "Learning" },
  Other: { label: "Other", plural: "Other" },
};

export function typeMeta(type: string) {
  return BUILT_IN_META[type] ?? { label: type, plural: type };
}

/**
 * Two types with the same key look identical on screen — built-in "Website"
 * shows as "Websites", the same as a custom "Websites" — so they count as one
 * type: the Profile list refuses the second, and the Resources page merges them.
 */
export function resourceTypeKey(type: string) {
  return typeMeta(type).plural.trim().toLowerCase();
}
