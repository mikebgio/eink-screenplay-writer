import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyChanges,
  deleteVariable,
  listVariableKeys,
  paginate,
  parse,
  renameVariable,
  renderPagedText,
  resolve,
  setVariable,
  variableUses,
} from '../src/engine';
import type { EditResult } from '../src/engine';

const SCRIPT = [
  'Title: The Long Night',
  'Var-HERO: Jack Reyes',
  'Var-TOWN: Port Avalon',
  '',
  'EXT. {{TOWN}} - DAY',
  '',
  '{{HERO}} walks in. Not \\{{HERO}} though.',
  '',
  '{{HERO}} (V.O.)',
  'Welcome to {{TOWN}}.',
  '',
].join('\n');

const lines = (text: string, mode: 'resolve' | 'keep' = 'resolve') =>
  paginate(resolve(parse(text), { mode }).doc).pages.flatMap((p) => p.lines.map((l) => l.text));
const changes = (r: EditResult) => {
  if ('error' in r) throw new Error(r.error);
  return r.changes;
};

describe('resolve', () => {
  it('substitutes in scene headings, action and dialogue', () => {
    const l = lines(SCRIPT);
    expect(l).toContain('EXT. Port Avalon - DAY');
    expect(l).toContain('Jack Reyes walks in. Not {{HERO}} though.');
    expect(l).toContain('Welcome to Port Avalon.');
  });

  it('recognises {{KEY}} cues, prints the value in uppercase and keeps a stable identity', () => {
    const doc = parse(SCRIPT);
    const cue = doc.elements.find((e) => e.type === 'character')!;
    expect(cue).toMatchObject({ identity: '{{HERO}}', extension: 'V.O.' });
    const r = resolve(doc).doc.elements.find((e) => e.type === 'character')!;
    expect(r.text).toBe('JACK REYES (V.O.)');
    expect(r.identity).toBe('{{HERO}}');
    const other = resolve(parse(SCRIPT.replace('Jack Reyes', 'Mara Quinn'))).doc.elements.find(
      (e) => e.type === 'character',
    )!;
    expect(other.text).toBe('MARA QUINN (V.O.)');
    expect(other.identity).toBe(r.identity);
  });

  it('removes the backslash from \\{{ and prints a literal {{', () => {
    expect(lines('A \\{{KEY}} b')).toEqual(['A {{KEY}} b']);
  });

  it('leaves an invalid lowercase key literal and reports it', () => {
    const r = resolve(parse('Var-NAME: Zed\n\nHello {{name}}.'));
    expect(r.doc.elements[0]!.text).toBe('Hello {{name}}.');
    expect(r.diagnostics).toContainEqual(
      expect.objectContaining({ key: 'name', kind: 'invalid' }),
    );
  });

  it('reports undefined and unused keys', () => {
    const r = resolve(parse('Var-A: 1\nVar-B: 2\n\nUse {{A}} and {{C}}.'));
    expect(r.doc.elements[0]!.text).toBe('Use 1 and {{C}}.');
    const d = r.diagnostics.map((x) => [x.kind, x.key]);
    expect(d).toContainEqual(['undefined', 'C']);
    expect(d).toContainEqual(['unused', 'B']);
    expect(d).not.toContainEqual(['unused', 'A']);
    const c = r.diagnostics.find((x) => x.key === 'C')!;
    expect(c.positions).toEqual([{ from: 33, to: 38 }]);
  });

  it('keep mode leaves {{KEY}} in place', () => {
    expect(lines(SCRIPT, 'keep')).toContain('EXT. {{TOWN}} - DAY');
  });

  it('hides Var- entries from the title page and fills values into other entries', () => {
    const r = resolve(parse('Title: Life in {{TOWN}}\nVar-TOWN: Avalon\n\nText.'));
    expect(r.doc.titlePage).toEqual([{ key: 'Title', value: 'Life in Avalon' }]);
  });

  it('shifts emphasis spans when a longer value is substituted', () => {
    const el = resolve(parse('Var-X: LONGER\n\n{{X}} is *bold*.')).doc.elements[0]!;
    expect(el.text).toBe('LONGER is bold.');
    expect(el.styles).toEqual([{ from: 10, to: 14, kind: 'italic' }]);
  });

  it('a longer value changes wrapping and page breaks', () => {
    const body = (v: string) => `Var-V: ${v}\n\n` + Array.from({ length: 30 }, () => 'Hello {{V}}.').join('\n\n');
    const short = paginate(resolve(parse(body('x'))).doc);
    const long = paginate(resolve(parse(body('word '.repeat(40).trim()))).doc);
    expect(long.pageCount).toBeGreaterThan(short.pageCount);
  });

  it('lists defined and used keys for autocomplete', () => {
    expect(listVariableKeys(parse(SCRIPT))).toEqual(['HERO', 'TOWN']);
    expect(listVariableKeys(parse('Use {{Z}} {{A}}'))).toEqual(['A', 'Z']);
  });

  it('records where each key is used', () => {
    const uses = variableUses(parse(SCRIPT)).filter((u) => u.key === 'HERO');
    expect(uses).toHaveLength(2);
    expect(uses.map((u) => SCRIPT.slice(u.from, u.to))).toEqual(['{{HERO}}', '{{HERO}}']);
    expect(uses[1]!.inCue).toBe(true);
  });
});

describe('title-page transforms', () => {
  it('updates an existing value in place', () => {
    const out = applyChanges(SCRIPT, changes(setVariable(SCRIPT, 'HERO', 'Ann Lee')));
    expect(out.split('\n').slice(0, 3)).toEqual(['Title: The Long Night', 'Var-HERO: Ann Lee', 'Var-TOWN: Port Avalon']);
  });

  it('adds a key to an existing title page', () => {
    const out = applyChanges(SCRIPT, changes(setVariable(SCRIPT, 'CAT', 'Tom')));
    expect(out.split('\n').slice(0, 4)).toEqual([
      'Title: The Long Night',
      'Var-HERO: Jack Reyes',
      'Var-TOWN: Port Avalon',
      'Var-CAT: Tom',
    ]);
    expect(parse(out).titlePage).toHaveLength(4);
  });

  it('creates a title page when there is none', () => {
    const out = applyChanges('Hello {{A}}.', changes(setVariable('Hello {{A}}.', 'A', 'x')));
    expect(out).toBe('Var-A: x\n\nHello {{A}}.');
    expect(resolve(parse(out)).doc.elements[0]!.text).toBe('Hello x.');
    expect(applyChanges('', changes(setVariable('', 'A', 'x')))).toBe('Var-A: x\n');
  });

  it('rejects bad keys and values with line breaks', () => {
    expect(setVariable('', 'hero', 'x')).toHaveProperty('error');
    expect(setVariable('', 'HERO', 'a\nb')).toHaveProperty('error');
  });

  it('rename updates the definition and every use in one set of changes', () => {
    const out = applyChanges(SCRIPT, changes(renameVariable(SCRIPT, 'HERO', 'LEAD')));
    expect(out).toContain('Var-LEAD: Jack Reyes');
    expect(out).not.toContain('Var-HERO');
    expect(out.match(/\{\{LEAD\}\}/g)).toHaveLength(2);
    expect(out).toContain('Not \\{{HERO}} though.'); // escaped text is not a use
    expect(resolve(parse(out)).doc.elements.find((e) => e.type === 'character')!.text).toBe('JACK REYES (V.O.)');
  });

  it('rename refuses an existing or invalid key', () => {
    expect(renameVariable(SCRIPT, 'HERO', 'TOWN')).toHaveProperty('error');
    expect(renameVariable(SCRIPT, 'HERO', 'lead')).toHaveProperty('error');
  });

  it('delete with uses: inline replaces them with the value (uppercase in a cue)', () => {
    const out = applyChanges(SCRIPT, changes(deleteVariable(SCRIPT, 'HERO', 'inline')));
    expect(out).not.toContain('Var-HERO');
    expect(out).toContain('Jack Reyes walks in.');
    expect(out).toContain('\nJACK REYES (V.O.)\n');
  });

  it('delete with uses: undefine keeps the uses', () => {
    const out = applyChanges(SCRIPT, changes(deleteVariable(SCRIPT, 'HERO', 'undefine')));
    expect(out).not.toContain('Var-HERO');
    expect(out.match(/\{\{HERO\}\}/g)).toHaveLength(3); // two uses and the escaped one
    expect(resolve(parse(out)).diagnostics).toContainEqual(
      expect.objectContaining({ key: 'HERO', kind: 'undefined' }),
    );
  });

  it('deleting the only entry removes the whole title page', () => {
    const t = 'Var-A: 1\n\nHi.';
    expect(applyChanges(t, changes(deleteVariable(t, 'A', 'undefine')))).toBe('Hi.');
  });

  it('deleting the last of several entries keeps the rest intact', () => {
    const out = applyChanges(SCRIPT, changes(deleteVariable(SCRIPT, 'TOWN', 'undefine')));
    expect(out.split('\n').slice(0, 3)).toEqual(['Title: The Long Night', 'Var-HERO: Jack Reyes', '']);
  });
});

describe('variables in pagination (golden)', () => {
  const FIXTURES = new URL('./fixtures/variables/', import.meta.url);
  const GOLDEN = new URL('./golden/variables/', import.meta.url);
  const render = (name: string) =>
    renderPagedText(paginate(resolve(parse(readFileSync(new URL(`${name}.fountain`, FIXTURES), 'utf8'))).doc));

  for (const name of ['short-value', 'long-value']) {
    it(name, () => {
      const actual = render(name);
      const file = new URL(`${name}.txt`, GOLDEN);
      if (process.env.UPDATE_GOLDEN) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, actual);
      }
      expect(existsSync(file), `missing golden file ${name}.txt (run with UPDATE_GOLDEN=1)`).toBe(true);
      expect(actual).toBe(readFileSync(file, 'utf8'));
    });
  }

  it('a longer value wraps onto more lines and moves page breaks', () => {
    const short = render('short-value');
    const long = render('long-value');
    expect(long.match(/=== PAGE/g)!.length).toBeGreaterThan(short.match(/=== PAGE/g)!.length);
  });
});
