import { CHARS_PER_INCH } from './paginate';
import type { Page, PagedScript } from './types';

/**
 * Plain-text picture of one page for golden files and debugging: a `=== PAGE n ===` header, then each
 * line placed at its x position (10 characters per inch; a US Letter page is 85 columns). The page number, when present, is drawn two
 * rows above the first body line.
 */
export function renderPageText(page: Page): string {
  const rows = new Map<number, string>();
  for (const l of page.lines) {
    const col = Math.round(l.xIn * CHARS_PER_INCH);
    const cur = (rows.get(l.yLine) ?? '').padEnd(col, ' ');
    rows.set(l.yLine, cur + l.text);
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
  const all = paged.titlePage ? [paged.titlePage, ...paged.pages] : paged.pages;
  return all.map(renderPageText).join('\n') + '\n';
}
