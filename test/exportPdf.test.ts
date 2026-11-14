import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  A4,
  exportPdf,
  paginate,
  parse,
  resolve,
  US_LETTER,
  type PagedScript,
  type PdfFonts,
} from '../src/engine';

const font = (name: string) => new Uint8Array(readFileSync(`assets/fonts/CourierPrime-${name}.ttf`));
const FONTS: PdfFonts = {
  regular: font('Regular'),
  bold: font('Bold'),
  italic: font('Italic'),
  boldItalic: font('BoldItalic'),
};
const NOW = new Date('2026-11-14T10:00:00Z');
const fixture = (dir: string, name: string) => readFileSync(`test/fixtures/${dir}/${name}.fountain`, 'utf8');
const layout = (text: string, mode: 'resolve' | 'keep' = 'resolve', spec = US_LETTER) =>
  paginate(resolve(parse(text), { mode }).doc, spec);

interface PdfItem {
  str: string;
  /** Baseline origin of the text, in PDF points from the bottom-left corner. */
  x: number;
  y: number;
}
interface PdfPage {
  items: PdfItem[];
  width: number;
  height: number;
}

async function readPdf(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 })
    .promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [, , width, height] = page.view as [number, number, number, number];
    const content = await page.getTextContent();
    const items = content.items
      .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it)
      .map((it) => ({ str: it.str, x: it.transform[4]!, y: it.transform[5]! }));
    pages.push({ items, width: width!, height: height! });
  }
  const meta = await doc.getMetadata();
  return { pages, info: meta.info as Record<string, string> };
}

/** Text with all white space removed: pdf.js may split or join runs, but never reorders them. */
const squash = (s: string) => s.replace(/\s+/g, '');
const pageText = (p: PdfPage) => squash(p.items.map((i) => i.str).join(''));

/** Golden page text: the `renderPageText` goldens from ticket 05/06, one entry per page. */
function goldenPages(name: string): string[] {
  const golden = readFileSync(`test/golden/paginate/${name}.txt`, 'utf8');
  return golden
    .split(/^=== PAGE \d+ ===$/m)
    .slice(1)
    .map(squash);
}

describe('exportPdf pages and text', () => {
  for (const name of ['dialogue', 'emphasis', 'title-page']) {
    it(`${name}: page count and text match the paginated script`, async () => {
      const paged = layout(fixture('paginate', name));
      const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW }));
      expect(pdf.pages).toHaveLength(paged.pageCount + (paged.titlePage ? 1 : 0));
      expect(pdf.pages.map(pageText)).toEqual(goldenPages(name));
    });
  }

  it('prints the page count of a long script (+1 for the title page)', async () => {
    const text = fixture('page-count', 'mixed');
    const paged = layout(`Title: Long\n\n${text}`);
    expect(paged.titlePage).toBeDefined();
    const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW }));
    expect(pdf.pages).toHaveLength(paged.pageCount + 1);
  });

  it('can leave the title page out', async () => {
    const paged = layout(fixture('paginate', 'title-page'));
    const pdf = await readPdf(
      await exportPdf(paged, { fonts: FONTS, now: NOW, includeTitlePage: false }),
    );
    expect(pdf.pages).toHaveLength(paged.pageCount);
    expect(pdf.pages.map(pageText)).toEqual(goldenPages('title-page').slice(1));
  });

  it('uses the paper size of the layout (Letter and A4)', async () => {
    const text = fixture('paginate', 'three-pages');
    const letter = await readPdf(await exportPdf(layout(text), { fonts: FONTS, now: NOW }));
    expect(letter.pages[0]).toMatchObject({ width: 612, height: 792 });
    const a4 = await readPdf(await exportPdf(layout(text, 'resolve', A4), { fonts: FONTS, now: NOW }));
    expect(a4.pages[0]!.width).toBeCloseTo(8.27 * 72, 1);
    expect(a4.pages[0]!.height).toBeCloseTo(11.69 * 72, 1);
  });

  it('draws emphasised text (bold, italic, underline) in the text layer', async () => {
    const paged = layout(fixture('paginate', 'emphasis'));
    const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW }));
    expect(pageText(pdf.pages[0]!)).toContain('Shesaysnothingbutmeanseverythingittakestosay');
  });
});

describe('exportPdf watermark', () => {
  const MARK = 'CONFIDENTIAL – DRAFT 3';

  it('is on every body page and not on the title page', async () => {
    const paged = layout(fixture('paginate', 'title-page') + '\n===\n\nSecond page.\n');
    expect(paged.titlePage).toBeDefined();
    expect(paged.pageCount).toBeGreaterThan(1);
    const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW, watermark: MARK }));
    const [title, ...body] = pdf.pages;
    expect(body).toHaveLength(paged.pageCount);
    expect(title!.items.some((i) => i.str.includes('CONFIDENTIAL'))).toBe(false);
    for (const p of body) expect(p.items.some((i) => i.str === MARK)).toBe(true);
  });

  it('is on page 1 when there is no title page', async () => {
    const paged = layout('INT. ROOM - DAY\n\nHello.\n');
    const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW, watermark: MARK }));
    expect(pdf.pages).toHaveLength(1);
    expect(pdf.pages[0]!.items.some((i) => i.str === MARK)).toBe(true);
  });

  it('is absent when empty or blank', async () => {
    const paged = layout('INT. ROOM - DAY\n\nHello.\n');
    for (const watermark of [undefined, '', '   ']) {
      const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW, watermark }));
      expect(pdf.pages[0]!.items.map((i) => i.str).join(' ')).not.toMatch(/CONFIDENTIAL/);
    }
  });

  it('survives characters Helvetica cannot draw', async () => {
    const paged = layout('INT. ROOM - DAY\n\nHello.\n');
    await expect(
      exportPdf(paged, { fonts: FONTS, now: NOW, watermark: 'DRAFT ☃ 日本' }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('exportPdf variables', () => {
  const SCRIPT = 'Title: T\nVar-HERO: Jack Reyes\n\nINT. ROOM - DAY\n\n{{HERO}} enters.\n';

  it('keep mode prints {{HERO}}; resolve mode prints the value', async () => {
    const keep = await readPdf(await exportPdf(layout(SCRIPT, 'keep'), { fonts: FONTS, now: NOW }));
    const filled = await readPdf(await exportPdf(layout(SCRIPT, 'resolve'), { fonts: FONTS, now: NOW }));
    const text = (p: Awaited<ReturnType<typeof readPdf>>) => p.pages.map(pageText).join('');
    expect(text(keep)).toContain('{{HERO}}enters.');
    expect(text(keep)).not.toContain('JackReyes');
    expect(text(filled)).toContain('JackReyesenters.');
    expect(text(filled)).not.toContain('{{HERO}}');
  });
});

describe('exportPdf metadata and determinism', () => {
  const SCRIPT = 'Title: BIG FISH\nAuthor: John August\n\nINT. ROOM - DAY\n\nHello.\n';

  it('takes title and author from the title page; the creator is Scriptwriter', async () => {
    const pdf = await readPdf(await exportPdf(layout(SCRIPT), { fonts: FONTS, now: NOW }));
    expect(pdf.info.Title).toBe('BIG FISH');
    expect(pdf.info.Author).toBe('John August');
    expect(pdf.info.Creator).toBe('Scriptwriter');
  });

  it('dates come from options.now', async () => {
    const pdf = await readPdf(await exportPdf(layout(SCRIPT), { fonts: FONTS, now: NOW }));
    expect(pdf.info.CreationDate).toBe('D:20261114100000Z');
    expect(pdf.info.ModDate).toBe('D:20261114100000Z');
  });

  it('has no title or author when the script has no title page', async () => {
    const pdf = await readPdf(
      await exportPdf(layout('INT. ROOM - DAY\n\nHello.\n'), { fonts: FONTS, now: NOW }),
    );
    expect(pdf.info.Title ?? '').toBe('');
    expect(pdf.info.Creator).toBe('Scriptwriter');
  });

  it('is byte-identical across runs with a fixed now', async () => {
    const paged = layout(SCRIPT + '\n' + fixture('paginate', 'emphasis'));
    const options = { fonts: FONTS, now: NOW, watermark: 'DRAFT' };
    const a = await exportPdf(paged, options);
    const b = await exportPdf(paged, options);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('differs when now differs', async () => {
    const paged = layout(SCRIPT);
    const a = await exportPdf(paged, { fonts: FONTS, now: NOW });
    const b = await exportPdf(paged, { fonts: FONTS, now: new Date('2026-11-15T10:00:00Z') });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('exportPdf positions', () => {
  /**
   * Where the print view puts a baseline: its lines are 12pt boxes with a 12pt line-height, and the
   * browser centres Courier Prime's ascent (1600) + descent (700) of 2048 units inside the box.
   */
  const CONTENT = (12 * (1600 + 700)) / 2048;
  const BASELINE_IN_BOX = (12 - CONTENT) / 2 + (12 * 1600) / 2048;

  it('matches the inch values of the PagedScript to within 1pt', async () => {
    const paged: PagedScript = layout(fixture('paginate', 'dialogue'));
    const first = paged.pages[0]!;
    const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW }));
    const page = pdf.pages[paged.titlePage ? 1 : 0]!;
    // Five lines with distinct text and no emphasis, of different kinds and x positions.
    const kinds = new Set<string>();
    const picks = first.lines.filter((l) => {
      const unique = first.lines.filter((o) => o.text === l.text).length === 1;
      if (!unique || l.styles || l.kind === 'page-number' || kinds.has(l.kind)) return false;
      kinds.add(l.kind);
      return true;
    });
    expect(picks.length).toBeGreaterThanOrEqual(4);
    for (const line of picks.slice(0, 5)) {
      const item = page.items.find((i) => i.str === line.text);
      expect(item, `"${line.text}" in the PDF`).toBeDefined();
      const expectedX = line.xIn * 72;
      const expectedY = 792 - (paged.spec.topMarginIn + line.yLine / 6) * 72 - BASELINE_IN_BOX;
      expect(Math.abs(item!.x - expectedX), `${line.kind} x`).toBeLessThan(1);
      expect(Math.abs(item!.y - expectedY), `${line.kind} y`).toBeLessThan(1);
    }
  });

  it('dialogue starts 2.5 in from the page edge', async () => {
    const paged = layout(fixture('paginate', 'dialogue'));
    const dialogue = paged.pages[0]!.lines.find((l) => l.kind === 'dialogue')!;
    const pdf = await readPdf(await exportPdf(paged, { fonts: FONTS, now: NOW }));
    const page = pdf.pages[paged.titlePage ? 1 : 0]!;
    const item = page.items.find((i) => i.str === dialogue.text)!;
    expect(item.x / 72).toBeCloseTo(2.5, 2);
  });
});
