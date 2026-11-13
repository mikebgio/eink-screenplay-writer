import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  A4,
  formatRunningTime,
  pageIndexForLine,
  paginate,
  parse,
  renderPagedText,
  US_LETTER,
} from '../src/engine';

const FIXTURES = new URL('./fixtures/paginate/', import.meta.url);
const GOLDEN = new URL('./golden/paginate/', import.meta.url);
const names = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.fountain'))
  .map((f) => f.replace(/\.fountain$/, ''))
  .sort();
const load = (name: string) => readFileSync(new URL(`${name}.fountain`, FIXTURES), 'utf8');

describe('paginate golden files', () => {
  for (const name of names) {
    it(name, () => {
      const actual = renderPagedText(paginate(parse(load(name))));
      const file = new URL(`${name}.txt`, GOLDEN);
      if (process.env.UPDATE_GOLDEN) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, actual);
      }
      expect(existsSync(file), `missing golden file ${name}.txt (run with UPDATE_GOLDEN=1)`).toBe(
        true,
      );
      expect(actual).toBe(readFileSync(file, 'utf8'));
    });
  }
});

describe('page spec', () => {
  it('gives A4 and US Letter different page counts for the same 3-page fixture', () => {
    const doc = parse(load('three-pages'));
    const letter = paginate(doc, US_LETTER);
    const a4 = paginate(doc, A4);
    expect(letter.pageCount).toBe(3);
    expect(a4.pageCount).toBe(2);
    expect(Math.max(...a4.pages[0]!.lines.map((l) => l.yLine))).toBeLessThan(58);
    expect(Math.max(...letter.pages[0]!.lines.map((l) => l.yLine))).toBeLessThan(54);
  });

  it('counts pages and running time, excluding the title page', () => {
    const paged = paginate(parse(load('title-page')));
    expect(paged.titlePage?.number).toBe(0);
    expect(paged.pageCount).toBe(1);
    expect(paged.estimatedMinutes).toBe(1);
    const three = paginate(parse(load('three-pages')));
    expect(three.estimatedMinutes).toBe(three.pageCount);
    expect(formatRunningTime(112)).toBe('≈ 1h 52m');
    expect(formatRunningTime(45)).toBe('≈ 45m');
  });

  it('numbers pages from 2 and leaves page 1 bare', () => {
    const paged = paginate(parse(load('three-pages')));
    const nums = paged.pages.map((p) => p.lines.find((l) => l.kind === 'page-number')?.text);
    expect(nums).toEqual([undefined, '2.', '3.']);
  });

  it('links lines back to their source element', () => {
    const doc = parse(load('dialogue'));
    const paged = paginate(doc);
    for (const l of paged.pages[0]!.lines) {
      if (l.kind === 'dialogue') expect(doc.elements[l.elementIndex]!.type).toBe('dialogue');
    }
  });

  it('carries emphasis onto wrapped lines', () => {
    const lines = paginate(parse(load('emphasis'))).pages[0]!.lines;
    const italic = lines.filter((l) => l.styles?.some((s) => s.kind === 'italic'));
    expect(italic.length).toBeGreaterThanOrEqual(2);
    const first = lines.find((l) => l.styles?.some((s) => s.kind === 'italic'))!;
    const span = first.styles!.find((s) => s.kind === 'italic')!;
    expect(first.text.slice(span.from, span.to)).toBe('nothing');
  });
});

describe('performance', () => {
  it('paginates about 120 pages in under 50 ms', () => {
    const one = names.map(load).join('\n\n');
    const text = Array.from({ length: Math.ceil(6200 / one.split('\n').length) }, () => one).join(
      '\n\n',
    );
    const doc = parse(text);
    paginate(doc); // warm up
    const t0 = performance.now();
    const paged = paginate(doc);
    const ms = performance.now() - t0;
    console.log(`paginate: ${paged.pageCount} pages in ${ms.toFixed(1)} ms`);
    expect(paged.pageCount).toBeGreaterThan(100);
    expect(ms).toBeLessThan(50);
  });
});

describe('pageIndexForLine', () => {
  it('maps source lines to display pages, title page first', () => {
    const doc = parse(load('title-page'));
    const paged = paginate(doc);
    expect(pageIndexForLine(doc, paged, 0)).toBe(0); // title block
    expect(pageIndexForLine(doc, paged, doc.elements[0]!.startLine)).toBe(1);
  });

  it('finds the page of a line past a page break, and of a hidden note', () => {
    const doc = parse(load('page-break'));
    const paged = paginate(doc);
    expect(pageIndexForLine(doc, paged, doc.elements.at(-1)!.startLine)).toBe(1);
    expect(pageIndexForLine(doc, paged, 0)).toBe(0);
  });
});
