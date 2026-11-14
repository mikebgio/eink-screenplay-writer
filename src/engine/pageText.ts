import { displayPages } from './locate';
import { CHARS_PER_INCH } from './paginate';
import type { Page, PagedScript, PositionedLine } from './types';

/**
 * Plain-text picture of one page for golden files and debugging: a `=== PAGE n ===` header, then each
 * line placed at its x position (10 characters per inch; a US Letter page is 85 columns). The page number, when present, is drawn two
 * rows above the first body line.
 */
export function renderPageText(page: Page): string {
  const byRow = new Map<number, PositionedLine[]>();
  for (const l of page.lines) (byRow.get(l.yLine) ?? byRow.set(l.yLine, []).get(l.yLine)!).push(l);
  const rows = new Map<number, string>();
  for (const [y, ls] of byRow) {
    // Lines sharing a row (dual columns, scene numbers) are drawn left to right.
    if (ls.length > 1) ls.sort((a, b) => a.xIn - b.xIn);
    let cur = '';
    for (const l of ls) cur = cur.padEnd(Math.round(l.xIn * CHARS_PER_INCH), ' ') + l.text;
    rows.set(y, cur);
  }
  const ys = [...rows.keys()];
  const out = [`=== PAGE ${page.number} ===`];
  if (ys.length > 0) {
    for (let y = Math.min(0, ...ys); y <= Math.max(...ys); y++)
      out.push((rows.get(y) ?? '').trimEnd());
  }
  return out.join('\n');
}

/** Every page (title page first, if any) rendered with `renderPageText`, ending with a newline. */
export function renderPagedText(paged: PagedScript): string {
  return displayPages(paged).map(renderPageText).join('\n') + '\n';
}
