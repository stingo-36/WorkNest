/**
 * A colour for each tag capsule. Shared (client + server).
 *
 * Known tech/brand tags take their brand colour (the Simple Icons values) so a
 * capsule "looks like" what it names; anything else gets a stable hue from the
 * tag's name. These are data, not UI tokens: the capsule only ever uses them
 * mixed into a pale fill / dark text (see `TagChip`), so contrast stays readable.
 * No network call — tag names never leave the app.
 */
const BRAND: Record<string, string> = {
  github: "#181717",
  git: "#f05032",
  gitlab: "#fc6d26",
  android: "#3ddc84",
  ios: "#000000",
  apple: "#000000",
  ai: "#8b5cf6",
  openai: "#412991",
  chatgpt: "#74aa9c",
  claude: "#d97757",
  anthropic: "#191919",
  gemini: "#8e75b2",
  figma: "#f24e1e",
  design: "#ec4899",
  react: "#61dafb",
  nextjs: "#000000",
  next: "#000000",
  vercel: "#000000",
  javascript: "#f7df1e",
  js: "#f7df1e",
  typescript: "#3178c6",
  ts: "#3178c6",
  node: "#5fa04e",
  nodejs: "#5fa04e",
  python: "#3776ab",
  java: "#ed8b00",
  php: "#777bb4",
  drupal: "#0678be",
  wordpress: "#21759b",
  css: "#663399",
  tailwind: "#06b6d4",
  html: "#e34f26",
  docker: "#2496ed",
  kubernetes: "#326ce5",
  aws: "#ff9900",
  azure: "#0078d4",
  gcp: "#4285f4",
  google: "#4285f4",
  postgres: "#4169e1",
  postgresql: "#4169e1",
  mysql: "#4479a1",
  redis: "#ff4438",
  mongodb: "#47a248",
  supabase: "#3fcf8e",
  firebase: "#dd2c00",
  slack: "#4a154b",
  notion: "#000000",
  jira: "#0052cc",
  linux: "#fcc624",
  security: "#dc2626",
  testing: "#15c213",
  devops: "#2496ed",
  mcp: "#191919",
  "vibe-coding": "#a855f7",
};

/** Hues for tags we don't recognise: spread round the wheel, readable when mixed. */
const FALLBACK = ["#0f766e", "#2563eb", "#7c3aed", "#c026d3", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2"];

export function tagColor(tag: string): string {
  const key = tag.trim().replace(/^#+/, "").toLowerCase();
  if (BRAND[key]) return BRAND[key];
  // First word of "react-native", "aws-lambda" etc. still counts.
  const head = key.split(/[-_.\s]/)[0];
  if (BRAND[head]) return BRAND[head];
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

/** Light or dark label for a solid capsule: whichever contrasts more with the fill (WCAG luminance). */
export function tagTextTone(hex: string): "light" | "dark" {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Contrast against white (1.0) vs the app's ink text (~0.017).
  return (1.05) / (lum + 0.05) >= (lum + 0.05) / 0.067 ? "light" : "dark";
}
