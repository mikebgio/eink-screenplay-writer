/** Element kinds recognised so far. Ticket 03 extends this union. */
export type ElementType = 'scene-heading' | 'action' | 'character' | 'dialogue';

export interface ScriptElement {
  type: ElementType;
  /** Display text. Multi-line elements are joined with "\n". Forced-heading "." prefix removed. */
  text: string;
  /** Source line range, 0-based, both inclusive. */
  startLine: number;
  endLine: number;
}

export interface ScriptDocument {
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
