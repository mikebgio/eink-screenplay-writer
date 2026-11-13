import type { Page, PagedScript, ScriptDocument } from './types';

/** Every page in reading order: the title page (number 0) when present, then the numbered pages. */
export function displayPages(paged: PagedScript): Page[] {
  return paged.titlePage ? [paged.titlePage, ...paged.pages] : paged.pages;
}

/** Element index → display page of its first printed line; built once per PagedScript, not per cursor move. */
const firstPageCache = new WeakMap<PagedScript, Map<number, number>>();
function firstPages(paged: PagedScript, pages: Page[], offset: number): Map<number, number> {
  let firstPage = firstPageCache.get(paged);
  if (!firstPage) {
    firstPage = new Map<number, number>();
    for (let p = offset; p < pages.length; p++) {
      for (const l of pages[p]!.lines)
        if (l.elementIndex >= 0 && !firstPage.has(l.elementIndex)) firstPage.set(l.elementIndex, p);
    }
    firstPageCache.set(paged, firstPage);
  }
  return firstPage;
}

/**
 * Index into `displayPages(paged)` of the page that shows source line `line` (0-based). Lines in the
 * title page block map to the title page; lines of elements that print nothing (notes, sections) map to
 * the page of the nearest printed element before them, or the first body page.
 */
export function pageIndexForLine(doc: ScriptDocument, paged: PagedScript, line: number): number {
  const pages = displayPages(paged);
  const offset = paged.titlePage ? 1 : 0;
  const firstEl = doc.elements[0];
  if (paged.titlePage && (!firstEl || line < firstEl.startLine)) return 0;
  let e = -1;
  for (let i = 0; i < doc.elements.length; i++) {
    if (doc.elements[i]!.startLine <= line) e = i;
    else break;
  }
  // The page where each printed element's first line lands; walk back to the nearest printed one.
  const firstPage = firstPages(paged, pages, offset);
  let found = offset;
  for (let i = e; i >= 0; i--) {
    const p = firstPage.get(i);
    if (p !== undefined) {
      found = p;
      break;
    }
  }
  return found;
}

/** The source line an element starts on, for tapping a printed line. */
export function sourceLineOf(doc: ScriptDocument, elementIndex: number): number | undefined {
  return doc.elements[elementIndex]?.startLine;
}
