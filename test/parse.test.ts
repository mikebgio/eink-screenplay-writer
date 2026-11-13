import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyLines, paginate, parse } from '../src/engine';
import type { ScriptDocument, ScriptElement } from '../src/engine';

const FIXTURES = new URL('./fixtures/parse/', import.meta.url);
const GOLDEN = new URL('./golden/parse/', import.meta.url);
const names = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.fountain'))
  .map((f) => f.replace(/\.fountain$/, ''))
  .sort();

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');

function describeElement(e: ScriptElement): string {
  const extra: string[] = [];
  if (e.forced) extra.push('forced');
  if (e.sceneNumber !== undefined) extra.push(`scene=${e.sceneNumber}`);
  if (e.dual) extra.push(`dual=${e.dual}`);
  if (e.level !== undefined) extra.push(`level=${e.level}`);
  if (e.extension !== undefined) extra.push(`ext=${e.extension}`);
  if (e.notes) extra.push(`spans=${e.notes.map((n) => `${n.kind}@${n.from}-${n.to}`).join(',')}`);
  if (e.styles) {
    extra.push(
      `styles=${e.styles.map((s) => `${s.kind}:${JSON.stringify(e.text.slice(s.from, s.to))}`).join(',')}`,
    );
  }
  const lines = e.startLine === e.endLine ? `${e.startLine}` : `${e.startLine}-${e.endLine}`;
  return [`${e.type} [${lines}]`, esc(e.text), ...extra].join(' | ');
}

function serialize(doc: ScriptDocument): string {
  const out = doc.titlePage.map((t) => `TITLE | ${esc(t.key)} | ${esc(t.value)}`);
  out.push(...doc.elements.map(describeElement));
  return out.join('\n') + '\n';
}

describe('parse golden files', () => {
  for (const name of names) {
    it(name, () => {
      const text = readFileSync(new URL(`${name}.fountain`, FIXTURES), 'utf8');
      const actual = serialize(parse(text));
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

  it('has a fixture for every element type', () => {
    const seen = new Set<string>();
    for (const name of names) {
      const text = readFileSync(new URL(`${name}.fountain`, FIXTURES), 'utf8');
      for (const e of parse(text).elements) seen.add(e.type);
    }
    expect([...seen].sort()).toEqual(
      [
        'action',
        'boneyard',
        'centered',
        'character',
        'dialogue',
        'lyric',
        'note',
        'page-break',
        'parenthetical',
        'scene-heading',
        'section',
        'synopsis',
        'transition',
      ].sort(),
    );
  });
});

describe('classifyLines agrees with parse', () => {
  for (const name of names) {
    it(name, () => {
      const text = readFileSync(new URL(`${name}.fountain`, FIXTURES), 'utf8');
      const doc = parse(text);
      const classes = classifyLines(text);
      expect(classes).toHaveLength(text.split(/\r?\n/).length);
      const expected = classes.map(() => 'blank' as string);
      doc.elements.forEach((e) => {
        for (let i = e.startLine; i <= e.endLine; i++) expected[i] = e.type;
      });
      // Title page lines are the only lines that belong to no element.
      const withTitle = expected.map((c, i) => (classes[i] === 'title-page' ? 'title-page' : c));
      expect(classes).toEqual(withTitle);
    });
  }
});

describe('title page', () => {
  it('keeps unknown keys and source order, with multi-line values', () => {
    const doc = parse(readFileSync(new URL('title-page.fountain', FIXTURES), 'utf8'));
    expect(doc.titlePage.map((t) => t.key)).toEqual([
      'Title',
      'Credit',
      'Author',
      'Source',
      'Draft date',
      'Contact',
      'My Custom Key',
    ]);
    expect(doc.titlePage[0]!.value).toBe('_BRICK & STEEL_\n**FULL RETIRED**');
    expect(doc.titlePage[5]!.value).toBe('Next Level Productions\n1588 Mission Dr.');
    expect(doc.elements[0]).toMatchObject({ type: 'scene-heading', startLine: 12 });
  });

  it('does not mistake a lone transition for a title page', () => {
    const doc = parse('CUT TO:\n\nINT. A - DAY');
    expect(doc.titlePage).toEqual([]);
    expect(doc.elements[0]!.type).toBe('transition');
  });
});

describe('notes and boneyard', () => {
  it('are kept in the document but not paginated', () => {
    const text =
      readFileSync(new URL('notes.fountain', FIXTURES), 'utf8') +
      '\n/* cut */\n\n# Section\n\n= synopsis\n';
    const doc = parse(text);
    expect(doc.elements.some((e) => e.type === 'note')).toBe(true);
    expect(doc.elements.some((e) => e.type === 'boneyard')).toBe(true);
    const printed = paginate(doc)
      .pages.flatMap((p) => p.lines.map((l) => l.text))
      .join('\n');
    for (const hidden of [
      'timeline',
      'whole-line',
      'margin note',
      'spans two',
      'cut',
      'Section',
      'synopsis',
    ]) {
      expect(printed).not.toContain(hidden);
    }
    expect(printed).toContain('She pauses and goes on.');
    expect(doc.elements.map((e) => e.raw).join('\n')).toContain('[[check the timeline]]');
  });

  it('removes boneyard text from the element that contains it', () => {
    const doc = parse('Visible /* hidden */ two.');
    expect(doc.elements[0]!.text).toBe('Visible two.');
    expect(doc.elements[0]!.notes).toEqual([{ from: 8, to: 20, kind: 'boneyard' }]);
  });
});

describe('dual dialogue', () => {
  it('marks both halves left and right', () => {
    const doc = parse(readFileSync(new URL('dual-dialogue.fountain', FIXTURES), 'utf8'));
    const chars = doc.elements.filter((e) => e.type === 'character');
    expect(chars.map((c) => [c.text, c.dual])).toEqual([
      ['BRICK', 'left'],
      ['STEEL', 'right'],
      ['AFTER', undefined],
      ['ANN', 'left'],
      ['BOB', 'right'],
    ]);
  });
});

describe('pagination of every element type', () => {
  it('lays out parentheticals, transitions, centred text and page breaks', () => {
    const paged = paginate(
      parse('MARA\n(quietly)\nHi.\n\nCUT TO:\n\n>THE END<\n\nBefore.\n\n===\n\nAfter.'),
    );
    const all = paged.pages.flatMap((p) => p.lines);
    expect(all.find((l) => l.type === 'parenthetical')).toMatchObject({ x: 3.1 });
    const t = all.find((l) => l.type === 'transition')!;
    expect(t.x + t.text.length / 10).toBeCloseTo(7.5);
    const c = all.find((l) => l.type === 'centered')!;
    expect(c.x + c.text.length / 20).toBeCloseTo(4.5);
    expect(paged.pageCount).toBe(2);
    expect(paged.pages[1]!.lines.map((l) => l.text)).toEqual(['After.']);
  });

  it('wraps parentheticals at 2.4 inches', () => {
    const lines = paginate(parse('MARA\n(a very long parenthetical remark indeed)\nHi.')).pages[0]!
      .lines;
    const p = lines.filter((l) => l.type === 'parenthetical');
    expect(p.length).toBeGreaterThan(1);
    for (const l of p) expect(l.text.length).toBeLessThanOrEqual(24);
  });
});

describe('performance', () => {
  it('parses a 120-page script quickly', () => {
    const parts = names.map((n) => readFileSync(new URL(`${n}.fountain`, FIXTURES), 'utf8'));
    const one = parts.join('\n\n');
    const perCopy = one.split('\n').length;
    const copies = Math.ceil(6000 / perCopy);
    const text = Array.from({ length: copies }, () => one).join('\n\n');
    parse(text); // warm up
    const t0 = performance.now();
    const doc = parse(text);
    const ms = performance.now() - t0;
    const lines = text.split('\n').length;
    console.log(`parse: ${lines} lines, ${doc.elements.length} elements in ${ms.toFixed(1)} ms`);
    expect(lines).toBeGreaterThanOrEqual(6000);
    expect(ms).toBeLessThan(300); // soft bound; the 30 ms target is logged, not enforced
  });
});
