/** Every Fountain element kind the engine recognises. */
export type ElementType =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'lyric'
  | 'section'
  | 'synopsis'
  | 'page-break'
  | 'note'
  | 'boneyard';

/** What `classifyLines` reports for one source line. */
export type LineClass = ElementType | 'title-page' | 'blank';

/** A `[[note]]` or a boneyard block in the source, as absolute character offsets (`to` exclusive). */
export interface SourceSpan {
  from: number;
  to: number;
  kind: 'note' | 'boneyard';
}

/** Emphasis over an element's display `text` (offsets into `text`, `to` exclusive). */
export interface StyleSpan {
  from: number;
  to: number;
  kind: 'bold' | 'italic' | 'underline';
}

export interface ScriptElement {
  type: ElementType;
  /**
   * Display text: Fountain markers (leading `.` `!` `@` `>` `~` `#` `=`, `[[ ]]`, the boneyard delimiters,
   * emphasis markers, a trailing `^` or `#12A#`) removed. Multi-line elements are joined with "\n".
   * For `note` and `boneyard` elements it is the inner content.
   */
  text: string;
  /** Original source of the element's lines. */
  raw: string;
  /** Source character offsets of the element's lines (`to` exclusive, newline not included). */
  from: number;
  to: number;
  /** Source line range, 0-based, both inclusive. */
  startLine: number;
  endLine: number;
  /** Written with an explicit marker (`.` `!` `@` `>`). */
  forced?: boolean;
  /** Scene heading's trailing `#12A#`, without the hashes. */
  sceneNumber?: string;
  /** Dual dialogue: set on every element of both halves of the pair. */
  dual?: 'left' | 'right';
  /** Section depth (`#` = 1). */
  level?: number;
  /** Character cue extension(s), e.g. `V.O.` or `V.O. CONT'D`. */
  extension?: string;
  /**
   * Character cues only: the name without extensions, as written (`{{HERO}}` stays `{{HERO}}` even after
   * `resolve` substitutes its value), so every use of one variable is the same character.
   */
  identity?: string;
  /** Inline notes/boneyard that overlap this element (absolute source offsets). Absent if none. */
  notes?: SourceSpan[];
  /** Emphasis spans over `text`. Absent if none. */
  styles?: StyleSpan[];
}

export interface TitleEntry {
  key: string;
  value: string;
}

export interface ScriptDocument {
  /** `Key: value` pairs from the top of the file, in source order, unknown keys included. */
  titlePage: TitleEntry[];
  elements: ScriptElement[];
}

/** Page geometry. Everything is in inches or lines (6 lines per inch). */
export interface PageSpec {
  name: 'letter' | 'a4';
  widthIn: number;
  heightIn: number;
  topMarginIn: number;
  /** Body lines per page. */
  bodyLines: number;
}

/** What a printed line is: a script element, the page number, or a title-page block. */
export type LineKind =
  ElementType | 'page-number' | 'title' | 'credit' | 'author' | 'source' | 'draft-date' | 'contact';

/** One rendered line on a page. */
export interface PositionedLine {
  text: string;
  /** Left edge in inches from the left of the paper. */
  xIn: number;
  /** Row from the top of the body area (0 = first body line, 6 rows per inch). Negative = in the top margin. */
  yLine: number;
  kind: LineKind;
  /** Index into ScriptDocument.elements; -1 for the page number and title-page lines. */
  elementIndex: number;
  /** Emphasis over this line's `text` (offsets into the line, `to` exclusive). Absent if none. */
  styles?: StyleSpan[];
}

export interface Page {
  /** 1-based page number; 0 for the title page. */
  number: number;
  lines: PositionedLine[];
}

export interface PagedScript {
  /** Numbered body pages, `pages[i].number === i + 1`. Never empty. */
  pages: Page[];
  /** Body pages only; the title page is not counted. */
  pageCount: number;
  /** Page count x 1 minute. */
  estimatedMinutes: number;
  /** Present when the document has a title page. Rendered before page 1 and not numbered. */
  titlePage?: Page;
  spec: PageSpec;
}
