import type { Extensions, JSONContent, NodeViewRenderer } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Heading } from "@tiptap/extension-heading";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

/**
 * One lowlight registry for the whole app. `common` ships the grammars we care
 * about — js/ts (which also cover jsx/tsx), java, python, json, bash, sql, css,
 * xml (html), go, rust — without pulling `highlight.js` in as a direct import,
 * which is only a transitive dependency here.
 */
export const lowlight = createLowlight(common);

/**
 * A code block with no language is still almost always JavaScript in this app,
 * so that is what an untagged block highlights as.
 */
export const DEFAULT_CODE_LANGUAGE = "javascript";

/**
 * The languages offered in the code block's language picker.
 *
 * highlight.js has no separate `jsx`/`tsx` grammars — its `javascript` and
 * `typescript` grammars already parse JSX/TSX — so those labels say so rather
 * than pretending to be distinct modes.
 */
export const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "javascript", label: "JavaScript / JSX" },
  { value: "typescript", label: "TypeScript / TSX" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "css", label: "CSS" },
  { value: "xml", label: "HTML" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "markdown", label: "Markdown" },
  { value: "plaintext", label: "Plain text" },
];

/** An empty but schema-valid document, for new notes. */
export const EMPTY_NOTE_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type NoteExtensionOptions = {
  /** Placeholder text for the empty document. Omitted → no placeholder plugin. */
  placeholder?: string;
  /**
   * Optional node view for the code block. Passed in by the editor so that this
   * module stays free of React imports and can be used from server code.
   */
  codeBlockNodeView?: NodeViewRenderer;
  /**
   * How many levels to push a page's own headings down when rendering, so they
   * nest under the page around them: the reader's topic title is an h3, so its
   * content headings render from h4 (offset 3); the editor sits under h2s
   * (offset 2). Only the rendered tag changes — stored JSON keeps level 1–3 and
   * `data-level` keeps the visual size. 0 (default) renders h1–h3 as-is.
   */
  headingOffset?: number;
};

/**
 * Builds the note schema. `NOTE_EXTENSIONS` below is the canonical instance —
 * anything that renders saved JSON (`generateHTML(json, NOTE_EXTENSIONS)`) must
 * use it so the editor and the read-only viewer agree on the schema.
 */
export function buildNoteExtensions({
  placeholder,
  codeBlockNodeView,
  headingOffset = 0,
}: NoteExtensionOptions = {}): Extensions {
  const NoteHeading = Heading.extend({
    // Pasted/copied headings: trust our own data-level first, then the tag (h4–h6 fold into 3).
    parseHTML() {
      return [
        {
          tag: "h1, h2, h3, h4, h5, h6",
          getAttrs: (element) => ({
            level: Math.min(Number((element as HTMLElement).dataset.level) || Number(element.tagName.slice(1)), 3),
          }),
        },
      ];
    },
    renderHTML({ node, HTMLAttributes }) {
      const level = node.attrs.level as number;
      const tag = `h${Math.min(level + headingOffset, 6)}`;
      return [tag, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-level": level }), 0];
    },
  }).configure({ levels: [1, 2, 3] });

  const CodeBlock = codeBlockNodeView
    ? CodeBlockLowlight.extend({
        addNodeView: () => codeBlockNodeView,
      })
    : CodeBlockLowlight;

  return [
    StarterKit.configure({
      // replaced by the lowlight code block below
      codeBlock: false,
      // replaced by NoteHeading (same node name, offset-aware tags)
      heading: false,
      // bundled by StarterKit in v3: bold, italic, strike, code, underline,
      // link, lists + listKeymap, blockquote, horizontalRule, hardBreak,
      // dropcursor, gapcursor, trailingNode and undoRedo.
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      },
    }),
    CodeBlock.configure({
      lowlight,
      defaultLanguage: DEFAULT_CODE_LANGUAGE,
      // Tab indents inside a code block instead of tabbing out of the editor
      enableTabIndentation: true,
      tabSize: 2,
    }),
    TextStyle,
    Highlight,
    NoteHeading,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({
      table: {
        resizable: true,
        // emits the .tableWrapper div in static HTML too, which is what makes
        // wide tables scroll instead of stretching the page
        renderWrapper: true,
      },
    }),
    ...(placeholder
      ? [
          Placeholder.configure({
            placeholder,
            emptyEditorClass: "is-editor-empty",
            emptyNodeClass: "is-empty",
          }),
        ]
      : []),
  ];
}

/**
 * The shared schema. Use this — and nothing hand-rolled — when turning saved
 * note JSON into rendered HTML, so the editor and the viewer never disagree.
 *
 * Note that `generateHTML` serialises through `DOMSerializer` and therefore
 * needs a real `document`: calling it in a server component throws
 * "window is not defined" (verified against @tiptap/core 3.31). So the
 * read-only viewer has to be a client component, and has two options:
 *
 * ```tsx
 * // 1. after mount, from the shared schema
 * const html = useMemo(
 *   () => (mounted ? generateHTML(json as JSONContent, NOTE_EXTENSIONS) : ""),
 *   [json, mounted],
 * );
 * // render into <div className="note-prose" dangerouslySetInnerHTML={{ __html: html }} />
 *
 * // 2. preferred — a non-editable editor, which also gets the code block's
 * //    language label and copy button, and works with SSR:
 * const editor = useEditor({
 *   extensions: buildNoteExtensions({ codeBlockNodeView }),
 *   content: json as JSONContent,
 *   editable: false,
 *   immediatelyRender: false,
 *   editorProps: { attributes: { class: "note-prose" } },
 * });
 * ```
 */
export const NOTE_EXTENSIONS: Extensions = buildNoteExtensions();
