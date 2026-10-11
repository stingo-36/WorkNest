"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/components/cn";

import { CodeBlock } from "./CodeBlock";
import { estimateDocHeight } from "./doc-height";
import { isJumping, NOTE_SCROLL_END } from "./smooth-scroll";
import { buildNoteExtensions, EMPTY_NOTE_DOC } from "./editor-extensions";

/**
 * A stored page body is `Json` as far as Prisma is concerned, so it reaches us
 * as `unknown`. Anything that is not a plain object cannot be a TipTap doc.
 */
function asDoc(value: unknown): JSONContent {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JSONContent;
  }
  return EMPTY_NOTE_DOC;
}

/** True for a document with nothing in it but empty blocks. */
function isBlank(doc: JSONContent): boolean {
  const blocks = doc.content;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  return blocks.every(
    (block) => !Array.isArray(block.content) || block.content.length === 0,
  );
}

/**
 * Deferred page bodies drain through one shared idle queue, a page at a time.
 *
 * Scrolling to a page pulls it out of the queue and mounts it at once, but the
 * queue is what guarantees every page ends up rendered: an IntersectionObserver
 * only fires while the document is actually being painted, so a note opened in
 * a background tab — or in an embedded/hidden viewport — would otherwise sit on
 * its skeletons indefinitely. Observed in practice, not theorised.
 */
type MountJob = () => void;

/** How close (px) a page must be to the screen before its editor mounts. */
const NEAR = 1000;

const queue: MountJob[] = [];
let draining = false;

/**
 * Idle time, or 250ms, whichever comes first.
 *
 * `requestIdleCallback`'s own `timeout` is not enough on its own: a background
 * tab may not be scheduling frames at all, so neither it nor the observer above
 * fires, and the queue stalls until the tab is looked at again. The `setTimeout`
 * still fires there (throttled, but it fires), so the two are raced and the
 * loser is cancelled.
 */
function whenIdle(run: () => void) {
  if (typeof window === "undefined") return;

  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(once, { timeout: 500 });
  }
  setTimeout(once, 250);
}

function drain() {
  if (draining) return;
  draining = true;
  const step = () => {
    // a page mounting mid-jump moves the jump's target; wait for it to land
    if (isJumping()) {
      whenIdle(step);
      return;
    }
    const job = queue.shift();
    if (!job) {
      draining = false;
      return;
    }
    job();
    whenIdle(step);
  };
  whenIdle(step);
}

function enqueue(job: MountJob) {
  queue.push(job);
  drain();
}

function dequeue(job: MountJob) {
  const index = queue.indexOf(job);
  if (index !== -1) queue.splice(index, 1);
}

/**
 * Renders one page body through a non-editable editor.
 *
 * Split out from `NoteViewer` because `useEditor` cannot be called
 * conditionally, and *not* creating the editor is the entire point of the
 * deferral below — a mounted ProseMirror instance is the expensive part, not
 * the element it renders into.
 */
function NoteDocument({ doc }: { doc: JSONContent }) {
  const extensions = useMemo(
    () =>
      buildNoteExtensions({
        codeBlockNodeView: ReactNodeViewRenderer(CodeBlock),
        // the reader's topic title is an h3 — page headings start at h4
        headingOffset: 3,
      }),
    [],
  );

  const editor = useEditor(
    {
      extensions,
      content: doc,
      editable: false,
      // required — rendering on the first pass breaks hydration
      immediatelyRender: false,
      editorProps: { attributes: { class: "note-prose" } },
    },
    [doc, extensions],
  );

  return <EditorContent editor={editor} />;
}

export type NoteViewerProps = {
  /** The saved TipTap JSON for one page. */
  content: unknown;
  /**
   * Mount the editor immediately instead of waiting for the page to come into
   * view. Set on the handful of pages that are on screen at load — everything
   * below the fold can wait.
   */
  priority?: boolean;
  className?: string;
};

/**
 * Renders saved note JSON read-only.
 *
 * `generateHTML()` serialises through `DOMSerializer` and needs a real
 * `document`, so it cannot run on the server (see `editor-extensions.ts`).
 * Instead this mounts a non-editable editor, which keeps the code block's
 * language label and copy button working while exposing no editable field.
 *
 * That editor is per *page*, though, and a note is one long document with every
 * page on it — an imported notebook can run to 30+. Mounting them all during
 * hydration takes long enough that the note looks like a list of empty
 * headings while it happens, so each page waits until it is near the viewport.
 * `rootMargin` is deliberately generous: the goal is for the editor to be ready
 * before you have scrolled to it, not the moment it becomes visible.
 */
export function NoteViewer({ content, priority, className }: NoteViewerProps) {
  const doc = useMemo(() => asDoc(content), [content]);
  const blank = useMemo(() => isBlank(doc), [doc]);
  const estimatedHeight = useMemo(() => estimateDocHeight(doc), [doc]);

  const [mounted, setMounted] = useState(priority ?? false);
  const host = useRef<HTMLDivElement>(null);

  const show = useCallback(() => setMounted(true), []);

  useEffect(() => {
    if (mounted) return;

    // the floor: this page mounts on its turn through the idle queue even if
    // nothing below ever fires
    enqueue(show);

    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return () => dequeue(show);
    }

    // ...and jumps the queue as soon as it is anywhere near the viewport, so
    // scrolling never waits on idle time. The margin is deliberately generous:
    // the editor should be ready before you reach the page, not as you land on
    // it.
    const mountNow = () => {
      dequeue(show);
      show();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        // Pages a smooth jump flies past stay as placeholders — mounting them
        // all would stall the jump. The ones near where it lands mount below.
        if (entries.some((entry) => entry.isIntersecting) && !isJumping()) mountNow();
      },
      { rootMargin: `${NEAR}px 0px` },
    );
    observer.observe(el);

    // A jump has landed: the observer won't fire again for a page it already
    // saw intersecting, so check by hand whether this one is near the screen.
    const onJumpEnd = () => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > -NEAR && rect.top < window.innerHeight + NEAR) mountNow();
    };
    window.addEventListener(NOTE_SCROLL_END, onJumpEnd);

    return () => {
      dequeue(show);
      observer.disconnect();
      window.removeEventListener(NOTE_SCROLL_END, onJumpEnd);
    };
  }, [mounted, show]);

  if (blank) {
    return (
      <p className={cn("text-base italic text-text-subtle", className)}>
        This page is empty.
      </p>
    );
  }

  // `min-w-0` lets wide tables and code blocks scroll inside their own box
  // instead of stretching the page.
  return (
    <div ref={host} className={cn("min-w-0", className)}>
      {mounted ? (
        <NoteDocument doc={doc} />
      ) : (
        // holds about the page's real height so nothing below lurches when the
        // skeleton is swapped for the content (see estimateDocHeight)
        <div aria-hidden="true" className="space-y-3 py-1" style={{ minHeight: estimatedHeight }}>
          <div className="h-3.5 w-[92%] animate-pulse rounded bg-surface-3/70" />
          <div className="h-3.5 w-[78%] animate-pulse rounded bg-surface-3/70" />
          <div className="h-3.5 w-[85%] animate-pulse rounded bg-surface-3/70" />
        </div>
      )}
    </div>
  );
}
