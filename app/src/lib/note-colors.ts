/**
 * A note's accent colour, used to tint its card and colour its icon.
 *
 * Brand icons keep their real brand colour (these hex values are brand data,
 * not UI theme tokens — the one deliberate exception to "tokens only").
 * Generic icons (Lucide, most Font Awesome) have no brand colour, so they get
 * one from a small fixed set, picked from the note id so it never changes.
 */

const BRAND_COLORS: Record<string, string> = {
  SiJavascript: "#F7DF1E",
  SiTypescript: "#3178C6",
  SiPython: "#3776AB",
  FaAws: "#FF9900",
  FaPython: "#3776AB",
  FaJs: "#F7DF1E",
  FaReact: "#61DAFB",
  FaDocker: "#2496ED",
  FaGitAlt: "#F05032",
  FaGithub: "#181717",
  SiClaude: "#D97757",
  SiAnthropic: "#191919",
  SiHuggingface: "#FFD21E",
  SiLangchain: "#1C3C3C",
  SiReact: "#61DAFB",
  SiNodedotjs: "#5FA04E",
  SiNextdotjs: "#000000",
  SiVuedotjs: "#4FC08D",
  SiAngular: "#DD0031",
  SiDocker: "#2496ED",
  SiKubernetes: "#326CE5",
  SiGit: "#F05032",
  SiGithub: "#181717",
  SiDrupal: "#0678BE",
  SiPhp: "#777BB4",
  SiLaravel: "#FF2D20",
  SiPostgresql: "#4169E1",
  SiMysql: "#4479A1",
  SiMongodb: "#47A248",
  SiRedis: "#FF4438",
  SiFirebase: "#FFCA28",
  SiHtml5: "#E34F26",
  SiCss: "#663399",
  SiTailwindcss: "#06B6D4",
  SiLinux: "#FCC624",
  SiGo: "#00ADD8",
  SiRust: "#000000",
  SiOpenjdk: "#437291",
  SiGooglecloud: "#4285F4",
  SiVercel: "#000000",
  SiFigma: "#F24E1E",
  SiJira: "#0052CC",
};

/**
 * For icons without a brand: deepened homepage hues (blue / pink / orange / ink),
 * so only real brand logos bring outside colour onto the page. Was a rainbow
 * until 2026-10-01. All clear 4.5:1 on white as icon colours.
 */
const FALLBACK_COLORS = ["#4562c9", "#b8395f", "#9a560f", "#3a52a8", "#2a2c3f"]; // homepage hues, deepened (no purple)

export function noteAccent(iconName: string | null | undefined, id: string) {
  if (iconName && BRAND_COLORS[iconName]) return BRAND_COLORS[iconName];
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** Very light brand colours (JS yellow) need a darker shade to stay visible as an icon. */
export function isLightColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}
