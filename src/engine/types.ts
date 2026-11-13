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

/** One rendered line on a page. Coordinates are inches from the top-left of the paper. */
export interface PositionedLine {
  text: string;
  /** Left edge in inches. */
  x: number;
  /** Top edge in inches. */
  y: number;
  type: ElementType;
  /** Index into ScriptDocument.elements. */
  elementIndex: number;
}

export interface Page {
  /** 1-based page number. */
  number: number;
  lines: PositionedLine[];
}

export interface PagedScript {
  pages: Page[];
  pageCount: number;
  /** Paper size in inches. */
  width: number;
  height: number;
}
