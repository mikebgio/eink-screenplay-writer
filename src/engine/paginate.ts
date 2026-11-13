import type { ElementType, Page, PagedScript, PositionedLine, ScriptDocument } from './types';

/** Courier at 12pt is 10 characters per inch and 6 lines per inch. */
export const CHARS_PER_INCH = 10;
export const LINES_PER_INCH = 6;
export const BODY_LINES_PER_PAGE = 54;
export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;
export const TOP_MARGIN_IN = 1;

interface Layout {
  /** Left edge in inches. */
  x: number;
  /** Wrap width in characters. */
  width: number;
}

/** Right edge of the text area, and its centre line, in inches. */
export const RIGHT_EDGE_IN = 7.5;
export const CENTER_IN = 4.5;

const ACTION: Layout = { x: 1.5, width: 60 };
const LAYOUT: Partial<Record<ElementType, Layout>> = {
  'scene-heading': ACTION,
  action: ACTION,
  lyric: ACTION,
  centered: ACTION,
  transition: ACTION,
  character: { x: 3.7, width: 35 },
  parenthetical: { x: 3.1, width: 24 },
  dialogue: { x: 2.5, width: 35 },
};

/** Never printed: they stay in the document but take no space on the page. */
const NOT_PRINTED = new Set<ElementType>(['section', 'synopsis', 'note', 'boneyard']);

function lineX(type: ElementType, layout: Layout, text: string): number {
  if (type === 'transition') return RIGHT_EDGE_IN - text.length / CHARS_PER_INCH;
  if (type === 'centered') return CENTER_IN - text.length / (2 * CHARS_PER_INCH);
  return layout.x;
}

/** Greedy word wrap by character count; over-long words are hard-split. */
export function wrap(text: string, width: number): string[] {
  if (!(width >= 1)) throw new RangeError(`wrap width must be >= 1, got ${width}`);
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let current = '';
    for (const word of raw.split(/\s+/).filter((w) => w.length > 0)) {
      let w = word;
      while (w.length > width) {
        if (current) {
          out.push(current);
          current = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (current === '') current = w;
      else if (current.length + 1 + w.length <= width) current += ' ' + w;
      else {
        out.push(current);
        current = w;
      }
    }
    out.push(current);
  }
  return out;
}

/**
 * Basic pagination (tickets 01, 03): one blank line between elements, 54 body lines per page,
 * lines break across pages wherever they fall. Page-break rules arrive in ticket 06.
 */
export function paginate(doc: ScriptDocument): PagedScript {
  const pages: Page[] = [];
  let page: Page = { number: 1, lines: [] };
  let row = 0; // next body row on the current page

  const startNewPage = () => {
    pages.push(page);
    page = { number: pages.length + 1, lines: [] };
    row = 0;
  };

  doc.elements.forEach((el, elementIndex) => {
    if (NOT_PRINTED.has(el.type)) return;
    if (el.type === 'page-break') {
      if (row > 0) startNewPage();
      return;
    }
    const layout = LAYOUT[el.type] ?? ACTION;
    const lines = wrap(el.text, layout.width);
    // Blank line between elements (not at the top of a page, and a page-ending blank is dropped).
    // wrap() always yields at least one line, so the loop's check handles a blank that ends the page.
    if (row > 0) row += 1;
    for (const text of lines) {
      if (row >= BODY_LINES_PER_PAGE) startNewPage();
      const line: PositionedLine = {
        text,
        x: lineX(el.type, layout, text),
        y: TOP_MARGIN_IN + row / LINES_PER_INCH,
        type: el.type,
        elementIndex,
      };
      page.lines.push(line);
      row++;
    }
  });
  if (page.lines.length > 0 || pages.length === 0) pages.push(page);

  return {
    pages,
    pageCount: pages.length,
    width: PAGE_WIDTH_IN,
    height: PAGE_HEIGHT_IN,
  };
}
