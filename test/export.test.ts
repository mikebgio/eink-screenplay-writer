import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfFonts } from '../src/engine';
import { MemoryStorage } from '../src/storage/memory';
import { exportBytes, saveExport, suggestedExportName } from '../src/storage/exportFile';
import { toBase64 } from '../src/storage/bytes';
import { mimeForName } from '../src/storage/port';
import { EXPORT_FORMATS, PDF_FORMAT, formatById } from '../src/ui/exportFormats';
import {
  DEFAULT_EXPORT_OPTIONS,
  blockingKeys,
  exportOptionsKey,
  parseExportOptions,
  type ExportContext,
  type ExportOptions,
} from '../src/ui/exportOptions';

const font = (n: string) => new Uint8Array(readFileSync(`assets/fonts/CourierPrime-${n}.ttf`));
const fonts = (): Promise<PdfFonts> =>
  Promise.resolve({
    regular: font('Regular'),
    bold: font('Bold'),
    italic: font('Italic'),
    boldItalic: font('BoldItalic'),
  });
const NOW = new Date('2026-11-14T10:00:00Z');
const ctx = (text: string, options: Partial<ExportOptions> = {}): ExportContext => ({
  text,
  options: { ...DEFAULT_EXPORT_OPTIONS, ...options },
  now: NOW,
  fonts,
});

async function pdfPages(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const out: { text: string; width: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push({
      text: content.items.map((it) => ('str' in it ? it.str : '')).join('').replace(/\s+/g, ''),
      width: page.view[2]!,
    });
  }
  return out;
}

describe('export options', () => {
  const ids = EXPORT_FORMATS.map((f) => f.id);

  it('uses the defaults when nothing is remembered', () => {
    expect(parseExportOptions(null, ids)).toEqual(DEFAULT_EXPORT_OPTIONS);
    expect(parseExportOptions('not json', ids)).toEqual(DEFAULT_EXPORT_OPTIONS);
  });

  it('round-trips remembered options', () => {
    const o: ExportOptions = {
      format: 'pdf',
      paper: 'a4',
      sceneNumbers: 'both',
      variables: 'keep',
      watermark: 'CONFIDENTIAL',
      titlePage: false,
    };
    expect(parseExportOptions(JSON.stringify(o), ids)).toEqual(o);
  });

  it('replaces invalid or unknown values one by one', () => {
    const raw = JSON.stringify({ format: 'gone', paper: 'legal', variables: 'keep', watermark: 5 });
    expect(parseExportOptions(raw, ids)).toEqual({
      ...DEFAULT_EXPORT_OPTIONS,
      format: ids[0],
      variables: 'keep',
    });
  });

  it('keeps options per document', () => {
    expect(exportOptionsKey('a')).not.toBe(exportOptionsKey('b'));
  });
});

describe('undefined-variable gate', () => {
  const o = DEFAULT_EXPORT_OPTIONS;
  const all = PDF_FORMAT.controls;

  it('blocks while keys are undefined', () => {
    expect(blockingKeys(['HERO', 'TOWN'], o, all, false)).toEqual(['HERO', 'TOWN']);
  });
  it('lets the export through once nothing is undefined', () => {
    expect(blockingKeys([], o, all, false)).toEqual([]);
  });
  it('lets it through with "Export anyway"', () => {
    expect(blockingKeys(['HERO'], o, all, true)).toEqual([]);
  });
  it('does not block when variables are kept, or the format has no Variables control', () => {
    expect(blockingKeys(['HERO'], { ...o, variables: 'keep' }, all, false)).toEqual([]);
    expect(blockingKeys(['HERO'], o, ['paper'], false)).toEqual([]);
  });
});

describe('file naming and saving', () => {
  it('suggests "<title> – <yyyy-mm-dd>.pdf" in local time', () => {
    const d = new Date(2026, 10, 4, 9, 30);
    expect(suggestedExportName('Big Fish', d, 'pdf')).toBe('Big Fish – 2026-11-04.pdf');
  });
  it('drops characters file systems reject, and falls back when the title is empty', () => {
    const d = new Date(2026, 10, 4);
    expect(suggestedExportName('A/B: "C"?', d, 'pdf')).toBe('A B C – 2026-11-04.pdf');
    expect(suggestedExportName('  ', d, 'fdx')).toBe('Script – 2026-11-04.fdx');
  });

  it('saves bytes through the storage port', async () => {
    const storage = new MemoryStorage();
    storage.nextCreate = { uri: 'mem://out.pdf', name: '' };
    const ref = await saveExport(storage, 'Big Fish – 2026-11-04.pdf', new Uint8Array([1, 2, 3]));
    expect(ref?.name).toBe('Big Fish – 2026-11-04.pdf');
    expect([...storage.bytes.get('mem://out.pdf')!]).toEqual([1, 2, 3]);
  });
  it('writes text exports as UTF-8', async () => {
    const storage = new MemoryStorage();
    storage.nextCreate = { uri: 'mem://out.fountain', name: 'out.fountain' };
    await saveExport(storage, 'out.fountain', 'é');
    expect([...storage.bytes.get('mem://out.fountain')!]).toEqual([0xc3, 0xa9]);
    expect(exportBytes('é')).toEqual(new Uint8Array([0xc3, 0xa9]));
  });
  it('writes nothing when the picker is cancelled', async () => {
    const storage = new MemoryStorage();
    expect(await saveExport(storage, 'x.pdf', new Uint8Array([1]))).toBeNull();
    expect(storage.writeCount).toBe(0);
  });

  it('base64-encodes large byte arrays', () => {
    const big = new Uint8Array(100_000).fill(65);
    expect(atob(toBase64(big))).toBe('A'.repeat(100_000));
  });
  it('maps extensions to MIME types', () => {
    expect(mimeForName('a.pdf')).toBe('application/pdf');
    expect(mimeForName('a.FDX')).toBe('application/xml');
    expect(mimeForName('a.fountain')).toBe('text/plain');
  });
});

describe('PDF format', () => {
  const SCRIPT = [
    'Title: Big Fish',
    'Var-HERO: Jack',
    '',
    'INT. ROOM - DAY',
    '',
    '{{HERO}} waits.',
    '',
    'EXT. YARD - NIGHT',
    '',
    'Rain.',
    '',
  ].join('\n');

  it('is the default, first format', () => {
    expect(EXPORT_FORMATS[0]).toBe(PDF_FORMAT);
    expect(formatById('nope')).toBe(PDF_FORMAT);
  });

  it('follows the dialog options: variables, title page, paper, scene numbers', async () => {
    const base = await pdfPages((await PDF_FORMAT.run(ctx(SCRIPT))) as Uint8Array);
    expect(base).toHaveLength(2); // title page + body
    expect(base[1]!.text).toContain('Jackwaits.');

    const keep = await pdfPages(
      (await PDF_FORMAT.run(ctx(SCRIPT, { variables: 'keep' }))) as Uint8Array,
    );
    expect(keep[1]!.text).toContain('{{HERO}}waits.');

    const noTitle = await pdfPages(
      (await PDF_FORMAT.run(ctx(SCRIPT, { titlePage: false }))) as Uint8Array,
    );
    expect(noTitle).toHaveLength(1);

    const a4 = await pdfPages((await PDF_FORMAT.run(ctx(SCRIPT, { paper: 'a4' }))) as Uint8Array);
    expect(a4[0]!.width).toBeCloseTo(8.27 * 72, 1);

    const numbered = await pdfPages(
      (await PDF_FORMAT.run(ctx(SCRIPT, { sceneNumbers: 'both' }))) as Uint8Array,
    );
    expect(numbered[1]!.text).toContain('1INT.ROOM-DAY1');

    const marked = await pdfPages(
      (await PDF_FORMAT.run(ctx(SCRIPT, { watermark: 'DRAFT 3' }))) as Uint8Array,
    );
    expect(marked[0]!.text).not.toContain('DRAFT3');
    expect(marked[1]!.text).toContain('DRAFT3');
  });

  it('prints undefined variables as {{KEY}} (the "Export anyway" output)', async () => {
    const pages = await pdfPages(
      (await PDF_FORMAT.run(ctx('INT. ROOM - DAY\n\n{{VILLAIN}} appears.\n'))) as Uint8Array,
    );
    expect(pages[0]!.text).toContain('{{VILLAIN}}appears.');
  });
});
