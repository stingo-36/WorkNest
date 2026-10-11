"use client";

import {
  AppWindow,
  Book,
  BookOpenText,
  Bookmark,
  Cloud,
  Database,
  FileCode2,
  Globe,
  GraduationCap,
  LibraryBig,
  Link2,
  Newspaper,
  Palette,
  Shield,
  Sparkles,
  SquareTerminal,
  Video,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext } from "react";

import { NoteIcon } from "@/components/notes/NoteIcon";
import type { NoteIconRef } from "@/lib/note-icons";

/**
 * A resource type's icon. Three sources, first match wins:
 *  1. the icon the user picked for that type (Profile → Resource types),
 *  2. a guess from the type's name — "Github" → the GitHub logo, "Commands" →
 *     a terminal, "Vibe Coding" → sparkles — so custom types don't all share
 *     one glyph,
 *  3. a plain bookmark.
 */

/** type name → "library:Name" (e.g. "si:SiGithub"), from `UserList.icons`. */
export type TypeIconMap = Record<string, string>;

const TypeIconsContext = createContext<TypeIconMap>({});
export const TypeIconsProvider = TypeIconsContext.Provider;

export function parseIconRef(value: string | null | undefined): NoteIconRef | null {
  if (!value) return null;
  const [library, name] = value.split(":");
  return library && name ? { library, name } : null;
}

export const iconRefKey = (icon: NoteIconRef) => `${icon.library}:${icon.name}`;

type Guess = { icon: LucideIcon } | { brand: NoteIconRef };

const BUILT_IN: Record<string, LucideIcon> = {
  Website: Globe,
  App: AppWindow,
  Link: Link2,
  Tool: Wrench,
  Command: SquareTerminal,
  Documentation: BookOpenText,
  Snippet: FileCode2,
  Reference: LibraryBig,
  Learning: GraduationCap,
  Other: Bookmark,
};

const brand = (name: string): Guess => ({ brand: { library: "si", name } });

// Order matters: "Vibe Coding" must hit "vibe" before "cod", "Code Snippets" → snippet.
const GUESSES: Array<[RegExp, Guess]> = [
  [/git ?hub/i, brand("SiGithub")],
  [/git ?lab/i, brand("SiGitlab")],
  [/figma/i, brand("SiFigma")],
  [/you ?tube/i, brand("SiYoutube")],
  [/vercel/i, brand("SiVercel")],
  [/docker/i, brand("SiDocker")],
  [/\bnpm\b/i, brand("SiNpm")],
  [/notion/i, brand("SiNotion")],
  [/drupal/i, brand("SiDrupal")],
  [/claude|anthropic/i, brand("SiClaude")],
  [/vibe|\bai\b|prompt|agent|llm|gpt/i, { icon: Sparkles }],
  [/snippet|code|script/i, { icon: FileCode2 }],
  [/command|\bcli\b|terminal|shell|bash/i, { icon: SquareTerminal }],
  [/doc/i, { icon: BookOpenText }],
  [/learn|course|tutorial|class/i, { icon: GraduationCap }],
  [/web|site/i, { icon: Globe }],
  [/link|bookmark|url/i, { icon: Link2 }],
  [/tool|util/i, { icon: Wrench }],
  [/\bapps?\b|software/i, { icon: AppWindow }],
  [/design|\bui\b|ux|colou?r|font/i, { icon: Palette }],
  [/video|watch/i, { icon: Video }],
  [/article|blog|news|read/i, { icon: Newspaper }],
  [/api|webhook|endpoint/i, { icon: Webhook }],
  [/data|\bdb\b|sql/i, { icon: Database }],
  [/cloud|deploy|host|server/i, { icon: Cloud }],
  [/secur|auth|password/i, { icon: Shield }],
  [/book|ref/i, { icon: Book }],
];

export function guessTypeIcon(type: string): Guess {
  const builtIn = BUILT_IN[type];
  if (builtIn) return { icon: builtIn };
  return GUESSES.find(([pattern]) => pattern.test(type))?.[1] ?? { icon: Bookmark };
}

export function TypeIcon({ type, className, strokeWidth }: { type: string; className?: string; strokeWidth?: number }) {
  const chosen = parseIconRef(useContext(TypeIconsContext)[type]);
  const fallback = <Bookmark className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (chosen) return <NoteIcon icon={chosen} className={className} fallback={fallback} />;
  const guess = guessTypeIcon(type);
  if ("brand" in guess) return <NoteIcon icon={guess.brand} className={className} fallback={fallback} />;
  const Icon = guess.icon;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
