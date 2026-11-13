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

const LAYOUT: Record<ElementType, Layout> = {
  'scene-heading': { x: 1.5, width: 60 },
  action: { x: 1.5, width: 60 },
  character: { x: 3.7, width: 35 },
  dialogue: { x: 2.5, width: 35 },
};

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
 * Minimal pagination (ticket 01): one blank line between elements, 54 body lines per page,
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
    const layout = LAYOUT[el.type];
    const lines = wrap(el.text, layout.width);
    // Blank line between elements (not at the top of a page, and a page-ending blank is dropped).
    // wrap() always yields at least one line, so the loop's check handles a blank that ends the page.
    if (row > 0) row += 1;
    for (const text of lines) {
      if (row >= BODY_LINES_PER_PAGE) startNewPage();
      const line: PositionedLine = {
        text,
        x: layout.x,
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
