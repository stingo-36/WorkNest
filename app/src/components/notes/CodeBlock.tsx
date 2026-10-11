"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/cn";

import { CODE_LANGUAGES, DEFAULT_CODE_LANGUAGE } from "./editor-extensions";

/**
 * The node view for `CodeBlockLowlight`.
 *
 * lowlight paints the tokens through a ProseMirror decoration plugin, so this
 * component only owns the chrome: the language picker and the copy button. The
 * `<pre><code>` underneath is rendered by `NodeViewContent` and stays fully
 * editable — indentation included, since the extension is configured with
 * `enableTabIndentation`.
 */
export function CodeBlock({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language =
    (node.attrs.language as string | null) || DEFAULT_CODE_LANGUAGE;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked (insecure origin, denied permission) — say nothing
      // rather than flashing a success state that did not happen
    }
  };

  // The picker offers whatever we registered plus, if the document arrived with
  // a language we do not list, that language — so opening a note never silently
  // rewrites its own content.
  const options = CODE_LANGUAGES.some((o) => o.value === language)
    ? CODE_LANGUAGES
    : [{ value: language, label: language }, ...CODE_LANGUAGES];

  return (
    <NodeViewWrapper
      className="note-code-block group relative my-4"
      data-language={language}
    >
      <div
        className="absolute right-2 top-2 z-10 flex items-center gap-1.5"
        contentEditable={false}
      >
        <select
          aria-label="Code language"
          value={language}
          disabled={!editor.isEditable}
          onChange={(event) =>
            updateAttributes({ language: event.target.value })
          }
          className={cn(
            "cursor-pointer rounded-full border border-border bg-surface/10 px-2.5 py-1",
            "text-xs text-[#C4CEDC] outline-none transition-colors",
            "[&:hover:not(:focus)]:border-border-strong focus:border-border-strong",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-default disabled:opacity-70",
            // the popup list is drawn by the OS, so its own colours must be
            // set explicitly or it inherits the dark trigger and goes unreadable
            "[&>option]:bg-[#14181F] [&>option]:text-[#E4E9F2]",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Code copied" : "Copy code"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/10",
            "px-2.5 py-1 text-xs font-medium text-[#C4CEDC] transition-colors",
            "hover:border-border-strong hover:text-white",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {copied ? (
            <Check aria-hidden="true" className="size-[13px]" />
          ) : (
            <Copy aria-hidden="true" className="size-[13px]" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" className={`language-${language}`} />
      </pre>
    </NodeViewWrapper>
  );
}

export default CodeBlock;
