import type {
  ElementType,
  LineKind,
  Page,
  PagedScript,
  PageSpec,
  PositionedLine,
  ScriptDocument,
  ScriptElement,
  StyleSpan,
} from './types';
import { extractEmphasis } from './parse';

/** Courier at 12pt is 10 characters per inch and 6 lines per inch. */
export const CHARS_PER_INCH = 10;
export const LINES_PER_INCH = 6;
/** Right edge of the text area, and its centre line, in inches. */
export const RIGHT_EDGE_IN = 7.5;
export const CENTER_IN = 4.5;
/** The page number sits 0.5 in from the top: three rows above the body area. */
export const PAGE_NUMBER_ROW = -3;

export const US_LETTER: PageSpec = {
  name: 'letter',
  widthIn: 8.5,
  heightIn: 11,
  topMarginIn: 1,
  bodyLines: 54,
};
export const A4: PageSpec = {
  name: 'a4',
  widthIn: 8.27,
  heightIn: 11.69,
  topMarginIn: 1,
  bodyLines: 58,
};

interface Layout {
  /** Left edge in inches. */
  x: number;
  /** Wrap width in characters. */
  width: number;
}

const ACTION: Layout = { x: 1.5, width: 60 };
const LAYOUT: Partial<Record<ElementType, Layout>> = {
  'scene-heading': ACTION,
  action: ACTION,
  lyric: ACTION,
  centered: ACTION,
  transition: ACTION,
  character: { x: 3.7, width: 38 },
  parenthetical: { x: 3.1, width: 24 },
  dialogue: { x: 2.5, width: 35 },
};

/** Never printed: they stay in the document but take no space on the page. */
const NOT_PRINTED = new Set<ElementType>(['section', 'synopsis', 'note', 'boneyard']);
/** Types that continue a dialogue block with no blank line before them. */
const IN_DIALOGUE = new Set<ElementType>(['character', 'parenthetical', 'dialogue']);

function lineX(type: ElementType, layout: Layout, text: string): number {
  if (type === 'transition') return RIGHT_EDGE_IN - text.length / CHARS_PER_INCH;
  if (type === 'centered') return CENTER_IN - text.length / (2 * CHARS_PER_INCH);
  return layout.x;
}

interface WrappedWord {
  /** Offset in the original text. */
  start: number;
  length: number;
  /** Column in the wrapped line. */
  col: number;
}
interface WrappedLine {
  text: string;
  words: WrappedWord[];
}

/** Greedy word wrap by character count, tracking where each word came from. Over-long words are hard-split. */
function wrapWords(text: string, width: number): WrappedLine[] {
  if (!(width >= 1)) throw new RangeError(`wrap width must be >= 1, got ${width}`);
  const out: WrappedLine[] = [];
  let base = 0;
  for (const raw of text.split('\n')) {
    let cur: WrappedLine = { text: '', words: [] };
    const flush = () => {
      out.push(cur);
      cur = { text: '', words: [] };
    };
    for (const m of raw.matchAll(/\S+/g)) {
      let start = base + m.index;
      let w = m[0];
      while (w.length > width) {
        if (cur.words.length) flush();
        out.push({ text: w.slice(0, width), words: [{ start, length: width, col: 0 }] });
        w = w.slice(width);
        start += width;
      }
      if (cur.words.length === 0) {
        cur.text = w;
        cur.words.push({ start, length: w.length, col: 0 });
      } else if (cur.text.length + 1 + w.length <= width) {
        cur.words.push({ start, length: w.length, col: cur.text.length + 1 });
        cur.text += ' ' + w;
      } else {
        flush();
        cur.text = w;
        cur.words.push({ start, length: w.length, col: 0 });
      }
    }
    flush();
    base += raw.length + 1;
  }
  return out;
}

/** Greedy word wrap by character count; over-long words are hard-split. */
export function wrap(text: string, width: number): string[] {
  return wrapWords(text, width).map((l) => l.text);
}

/** Project an element's style spans onto one wrapped line (offsets into the line). */
function lineStyles(line: WrappedLine, styles: StyleSpan[] | undefined): StyleSpan[] | undefined {
  if (!styles) return undefined;
  const out: StyleSpan[] = [];
  for (const s of styles) {
    let from = -1;
    let to = -1;
    for (const w of line.words) {
      const a = Math.max(s.from, w.start);
      const b = Math.min(s.to, w.start + w.length);
      if (a >= b) continue;
      if (from < 0) from = w.col + (a - w.start);
      to = w.col + (b - w.start);
    }
    if (from >= 0) out.push({ from, to, kind: s.kind });
  }
  return out.length ? out : undefined;
}

function makeLine(
  w: WrappedLine,
  kind: LineKind,
  xIn: number,
  yLine: number,
  elementIndex: number,
  styles?: StyleSpan[],
): PositionedLine {
  const line: PositionedLine = { text: w.text, xIn, yLine, kind, elementIndex };
  const s = lineStyles(w, styles);
  if (s) line.styles = s;
  return line;
}

const TITLE_KEYS: Record<string, LineKind> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  source: 'source',
  'draft date': 'draft-date',
  contact: 'contact',
};

/** Title page (page 0): title a third of the way down, draft date and contact at the bottom left. */
function titlePage(doc: ScriptDocument, spec: PageSpec): Page | undefined {
  // Title values may carry Fountain emphasis (e.g. `_**BRICK & STEEL**_`): print it, not the markers.
  const entries = new Map<LineKind, { text: string; styles: StyleSpan[] }>();
  for (const e of doc.titlePage) {
    const kind = TITLE_KEYS[e.key.trim().toLowerCase()];
    if (kind && e.value.trim() && !entries.has(kind)) entries.set(kind, extractEmphasis(e.value));
  }
  if (entries.size === 0) return undefined;
  const lines: PositionedLine[] = [];
  const place = (kind: LineKind, row: number, left: boolean): number => {
    const value = entries.get(kind);
    if (value === undefined) return row;
    const styles = value.styles.length ? value.styles : undefined;
    for (const w of wrapWords(value.text, ACTION.width)) {
      const x = left ? ACTION.x : CENTER_IN - w.text.length / (2 * CHARS_PER_INCH);
      lines.push(makeLine(w, kind, x, row++, -1, styles));
    }
    return row;
  };
  // About a third of the way down the paper, measured from the top edge.
  let row = Math.round((spec.heightIn / 3 - spec.topMarginIn) * LINES_PER_INCH);
  for (const kind of ['title', 'credit', 'author', 'source'] as const) {
    if (!entries.has(kind)) continue;
    row = place(kind, row, false) + 1;
  }
  // The bottom block is laid out first to measure it, then anchored to the last body row.
  const bottom: LineKind[] = (['draft-date', 'contact'] as const).filter((k) => entries.has(k));
  const heights = bottom.map((k) => wrapWords(entries.get(k)!.text, ACTION.width).length);
  let r = spec.bodyLines - (heights.reduce((a, b) => a + b, 0) + Math.max(0, bottom.length - 1));
  for (const kind of bottom) r = place(kind, r, true) + 1;
  return { number: 0, lines };
}

/**
 * Basic pagination (ticket 05): one blank line between elements (none inside a dialogue block), a
 * page's body lines fixed by `spec`, an element that doesn't fit moves whole to the next page, and an
 * element taller than a page splits at a line boundary. Industry page-break rules are ticket 06.
 */
export function paginate(doc: ScriptDocument, spec: PageSpec = US_LETTER): PagedScript {
  const pages: Page[] = [];
  let page: Page = { number: 1, lines: [] };
  let row = 0; // next body row on the current page

  const startNewPage = () => {
    pages.push(page);
    const number = pages.length + 1;
    page = { number, lines: [] };
    row = 0;
  };

  // A whole-line note/boneyard splits its block into two elements of the same type; the second
  // half continues the first on the page, with no blank line between them.
  let prev: ScriptElement | undefined; // last printed element
  let prevEndLine = -2; // end line of the last element seen, printed or not
  let spanJoined = false; // only notes/boneyard, with no blank line, since `prev`

  doc.elements.forEach((el, elementIndex) => {
    const adjacent = el.startLine === prevEndLine + 1;
    prevEndLine = el.endLine;
    if (el.type === 'note' || el.type === 'boneyard') {
      spanJoined = (spanJoined || prev?.endLine === el.startLine - 1) && adjacent;
      return;
    }
    const continues = spanJoined && adjacent && prev?.type === el.type;
    spanJoined = false;
    if (NOT_PRINTED.has(el.type)) return;
    if (el.type === 'page-break') {
      if (row > 0) startNewPage();
      return;
    }
    const inDialogue =
      (el.type === 'parenthetical' || el.type === 'dialogue') &&
      prev !== undefined &&
      IN_DIALOGUE.has(prev.type) &&
      prev.endLine === el.startLine - 1;
    prev = el;
    const layout = LAYOUT[el.type] ?? ACTION;
    const lines = wrapWords(el.text, layout.width);
    const blank = continues || inDialogue ? 0 : 1;
    // Basic rule: move the element whole if it fits on a page of its own.
    if (row > 0 && lines.length <= spec.bodyLines && row + blank + lines.length > spec.bodyLines) {
      startNewPage();
    }
    // No blank line at the top of a page; wrapWords always yields a line, so a blank that
    // would end a page is dropped by the page check below.
    if (row > 0) row += blank;
    for (const w of lines) {
      if (row >= spec.bodyLines) startNewPage();
      page.lines.push(
        makeLine(w, el.type, lineX(el.type, layout, w.text), row, elementIndex, el.styles),
      );
      row++;
    }
  });
  if (page.lines.length > 0 || pages.length === 0) pages.push(page);

  // Page numbers: none on page 1; the right edge is at 7.5 in.
  for (const p of pages) {
    if (p.number === 1) continue;
    const text = `${p.number}.`;
    p.lines.unshift({
      text,
      xIn: RIGHT_EDGE_IN - text.length / CHARS_PER_INCH,
      yLine: PAGE_NUMBER_ROW,
      kind: 'page-number',
      elementIndex: -1,
    });
  }

  const result: PagedScript = {
    pages,
    pageCount: pages.length,
    estimatedMinutes: pages.length,
    spec,
  };
  const title = titlePage(doc, spec);
  if (title) result.titlePage = title;
  return result;
}

/** "≈ 45m" or "≈ 1h 52m". */
export function formatRunningTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `≈ ${h}h ${m}m` : `≈ ${m}m`;
}
