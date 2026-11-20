/**
 * Reads a "Drupal Daily" email (Module Discovery & Release Updates) and returns
 * the modules in it. Pure — no I/O — so lib/gmail.ts and scripts can share it.
 *
 * The email is HTML. It's flattened to one line per block, with links kept as
 * `[text](url)`, then read by its fixed labels: a module is the line just above
 * a "Status:" line; its link is the drupal.org/project URL on the "Link:" line;
 * its description is the line after "What does it do?". "Module of the Day"
 * marks one of them (starred), and is never a module of its own.
 */

export type DigestModule = {
  title: string;
  /** https://www.drupal.org/project/<machine_name> */
  url: string;
  description: string;
  moduleOfTheDay: boolean;
};

const PROJECT_URL = /https?:\/\/(?:www\.)?drupal\.org\/project\/([a-z0-9_]+)/i;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** HTML → trimmed, non-empty lines; `<a href>` becomes `[text](href)`. */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => `[${inner.replace(/<[^>]+>/g, "").trim()}](${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|tr|table|section|header|footer|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Drops the markdown link syntax, keeping the text. */
const plain = (line: string) => line.replace(LINK, "$1").trim();

function projectUrl(line: string): string | null {
  for (const match of line.matchAll(LINK)) {
    const project = match[2].match(PROJECT_URL);
    if (project) return `https://www.drupal.org/project/${project[1].toLowerCase()}`;
  }
  const bare = line.match(PROJECT_URL);
  return bare ? `https://www.drupal.org/project/${bare[1].toLowerCase()}` : null;
}

export function parseDrupalDigest(html: string): DigestModule[] {
  const lines = htmlToLines(html);
  const modules: DigestModule[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!/^status\s*:/i.test(lines[i])) continue;
    // "Islandora — Digital Asset Management" → "Islandora": the part before the dash is the name.
    const title = plain(lines[i - 1]).split(/\s+[—–]\s+/)[0].trim();
    let url: string | null = null;
    let description = "";
    for (let j = i + 1; j < lines.length && !/^status\s*:/i.test(lines[j]); j++) {
      if (!url && /^link\s*:/i.test(lines[j])) url = projectUrl(lines[j]);
      const ask = lines[j].match(/^what does it do\?\s*(.*)$/i);
      if (ask && !description) description = plain(ask[1] || lines[j + 1] || "");
      // The next module's heading sits right above its "Status:" — stop before it.
      if (j + 1 < lines.length && /^status\s*:/i.test(lines[j + 1])) break;
    }
    if (!title || !url || modules.some((module) => module.url === url)) continue;
    modules.push({ title, url, description, moduleOfTheDay: false });
  }

  // "Module of the Day" names one module already listed — star it.
  const motd = lines.findIndex((line) => /module of the day/i.test(line));
  if (motd >= 0) {
    for (const line of lines.slice(motd + 1, motd + 4)) {
      const url = projectUrl(line);
      const match = url && modules.find((module) => module.url === url);
      if (match) { match.moduleOfTheDay = true; break; }
    }
  }
  return modules;
}
