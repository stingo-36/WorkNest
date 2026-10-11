/**
 * The "5-15 Report" layout, parsed from the stored Markdown so the preview and
 * the clipboard both follow the user's Google Doc:
 *   title (centred, bold) + date line → section bands (Completed This Week /
 *   Problems or Blockers) → bold group titles → bullets.
 * Client-safe (no server imports).
 */

export type ReportGroup = { title: string | null; bullets: string[] };
export type ReportSection = { heading: string; groups: ReportGroup[] };
export type ParsedReport = { title: string; dates: string; sections: ReportSection[] };

/** Inline Markdown → plain text (bold/italics/code markers and link targets dropped). */
function inline(text: string) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[`~]+/g, "")
    .replace(/(^|\s)[*_]+|[*_]+(?=\s|$)/g, "$1")
    .trim();
}

export function parseReport(markdown: string): ParsedReport {
  const report: ParsedReport = { title: "", dates: "", sections: [] };
  let section: ReportSection | null = null;
  let group: ReportGroup | null = null;

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length;
      const text = inline(heading[2]!);
      if (level === 1) report.title = text;
      else if (level === 2) {
        section = { heading: text, groups: [] };
        report.sections.push(section);
        group = null;
      } else {
        group = { title: text, bullets: [] };
        (section ??= pushSection(report, "")).groups.push(group);
      }
      continue;
    }
    if (!report.sections.length && /^\(.+\)$/.test(line)) {
      report.dates = line;
      continue;
    }
    const bullet = line.match(/^(?:[-*+•]|\d+[.)])\s+(.+)$/);
    const text = inline(bullet ? bullet[1]! : line);
    if (!group) {
      group = { title: null, bullets: [] };
      (section ??= pushSection(report, "")).groups.push(group);
    }
    group.bullets.push(text);
  }
  return report;
}

function pushSection(report: ParsedReport, heading: string) {
  const section = { heading, groups: [] };
  report.sections.push(section);
  return section;
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/*
 * Inline styles copied from the user's Google Doc export, so a paste lands with the
 * same look (Docs keeps inline font, size, weight, alignment and shading). These
 * are document styles for the clipboard, not app UI — hence literal values here.
 */
const DOC = {
  base: "font-family:Arial,sans-serif;color:#000000;",
  title: "text-align:center;font-size:20pt;font-weight:700;margin:0 0 16pt;",
  dates: "font-size:14pt;font-weight:700;",
  band: "background-color:#e6f0fa;font-size:15pt;font-weight:700;padding:8pt;margin:0;",
  group: "font-size:14pt;font-weight:700;margin:8pt 0 5pt;",
  bullet: "font-size:11pt;font-weight:400;",
  blank: "margin:0;font-size:11pt;",
};

/** Rich HTML for "Copy report" — pastes into Google Docs with the doc's formatting. */
export function reportToHtml(report: ParsedReport) {
  const blank = `<p style="${DOC.base}${DOC.blank}"><br></p>`;
  const out = [
    `<p style="${DOC.base}${DOC.title}">${escape(report.title)}${report.dates ? `<br><span style="${DOC.dates}">${escape(report.dates)}</span>` : ""}</p>`,
  ];
  for (const section of report.sections) {
    out.push(blank);
    if (section.heading) out.push(`<h1 style="${DOC.base}${DOC.band}">${escape(section.heading)}</h1>`, blank);
    for (const group of section.groups) {
      if (group.title) out.push(`<h2 style="${DOC.base}${DOC.group}">${escape(group.title)}</h2>`);
      if (group.bullets.length) {
        out.push(`<ul style="margin:0;padding-left:36pt;">${group.bullets.map((b) => `<li style="${DOC.base}${DOC.bullet}">${escape(b)}</li>`).join("")}</ul>`);
      }
      out.push(blank);
    }
  }
  return `<meta charset="utf-8"><div>${out.join("")}</div>`;
}

/** Plain-text fallback, shaped like the doc's own text export. */
export function reportToText(report: ParsedReport) {
  const lines = [report.title, report.dates, ""];
  for (const section of report.sections) {
    if (section.heading) lines.push("", section.heading, "");
    for (const group of section.groups) {
      if (group.title) lines.push("", group.title);
      lines.push(...group.bullets.map((b) => `* ${b}`));
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n\n").trim();
}
