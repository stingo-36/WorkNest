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

/** The fields search looks at — a Prisma Resource or the client's ResourceItem. */
type SearchableResource = { title: string; description: string; content: string; url: string | null; type: string; tags: string[] };

/** `/resources/<slug>`: the type's key, so "Website" and a custom "Websites" share one page. */
export const typeSlug = (type: string) => encodeURIComponent(resourceTypeKey(type));

/** Eight Ocean tones (globals.css `.rt-tone-*`), one per type, kept stable by hashing the name. */
export function typeTone(type: string) {
  let hash = 0;
  for (const char of resourceTypeKey(type)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `rt-tone-${hash % 8}`;
}

/** Every word must appear somewhere; "#" is ignored and dashes/spaces count as one. */
export function matchesSearch(resource: SearchableResource, query: string) {
  const norm = (value: string) => value.toLowerCase().replace(/#/g, "").replace(/[-_\s]+/g, " ");
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = norm([resource.title, resource.description, resource.content, resource.url ?? "", resource.type, ...resource.tags].join(" \u0000 "));
  return words.every((word) => haystack.includes(word));
}

/** Reading order = the user's list, then types still used but since removed. Same-key types merge; the list's spelling wins. */
export function orderTypes(typeList: string[], resources: Array<{ type: string }>) {
  const byKey = new Map<string, string>();
  for (const type of [...typeList, ...resources.map((resource) => resource.type)]) {
    if (!byKey.has(resourceTypeKey(type))) byKey.set(resourceTypeKey(type), type);
  }
  return [...byKey.values()];
}

/** A pasted value that is a web link (the Add form's first field). */
export function isWebLink(value: string) {
  return /^https?:\/\/\S+\.\S+/i.test(value.trim());
}

const KNOWN_SITES: Record<string, string> = {
  "github.com": "GitHub",
  "regex101.com": "Regex101",
  "react.dev": "React docs",
  "nodejs.org": "Node.js",
  "developer.mozilla.org": "MDN",
  "web.dev": "Web.dev",
  "excalidraw.com": "Excalidraw",
  "figma.com": "Figma",
};

const titleCase = (value: string) => value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();

/**
 * A starting title from a link, without fetching it (2026-11-20): a drupal.org
 * project is its module name; anything else is the site plus the last path
 * part ("React docs — Use Deferred Value"). The user can always change it.
 */
export function guessTitleFromUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (host === "drupal.org" && parts[0] === "project" && parts[1]) return titleCase(parts[1]);
    const site = KNOWN_SITES[host] ?? titleCase(host.split(".").slice(0, -1).join(" ") || host);
    const last = parts.at(-1)?.replace(/\.\w+$/, "");
    return last && !/^\d+$/.test(last) && last.length <= 40 ? `${site} — ${titleCase(last)}` : site;
  } catch {
    return "";
  }
}

/**
 * The likely type for what was pasted, chosen only from the user's own list:
 * code → Command (Snippet when it looks like code), drupal.org → Drupal, docs
 * sites → Documentation, courses → Learning, known tools → Tool, else Link /
 * Website. Returns null when nothing in the list fits.
 */
export function guessResourceType(source: string, options: string[]) {
  const value = source.trim();
  if (!value) return null;
  const pick = (...names: string[]) => {
    for (const name of names) {
      const hit = options.find((option) => resourceTypeKey(option) === resourceTypeKey(name));
      if (hit) return hit;
    }
    return null;
  };
  if (!isWebLink(value)) {
    const looksLikeCode = /\n|=>|\bfunction\b|\bconst\b|\bSELECT\b|;\s*$/.test(value);
    return looksLikeCode ? pick("Snippet", "Command") : pick("Command", "Snippet");
  }
  let host = "";
  try { host = new URL(value).hostname.replace(/^www\./, ""); } catch { return null; }
  if (host === "drupal.org") return pick("Drupal", "Link", "Website");
  if (/^(docs|developer)\.|react\.dev|nodejs\.org|mozilla\.org|readthedocs/.test(host)) return pick("Documentation", "Reference", "Link");
  if (/web\.dev|udemy|coursera|youtube|egghead|freecodecamp/.test(host)) return pick("Learning", "Link");
  if (/regex101|excalidraw|dalibo|github\.com|codepen|jsfiddle/.test(host)) return pick("Tool", "Website", "Link");
  if (/figma\.com|notion\.so|slack\.com|linear\.app/.test(host)) return pick("App", "Link");
  return pick("Link", "Website", "Reference");
}
