import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { undo, redo, undoDepth } from '@codemirror/commands';
import {
  DEFAULT_SEARCH,
  diffTitleValues,
  findMatches,
  parse,
  stepMatch,
  titlePageChanges,
  titleValues,
  updateTitlePage,
} from '../src/engine';
import { WordList } from '../src/spell/wordList';
import { SpellChecker } from '../src/spell/checker';
import { HISTORY_CONFIG, asUndoStep, historyExtension } from '../src/ui/historyConfig';
import { replaceAllSpec } from '../src/ui/searchEdits';

describe('updateTitlePage', () => {
  const BODY = '\nINT. HOUSE - DAY\n\nHello.\n';
  const SCRIPT = 'Title: Night\nVar-HERO: Jack\nX-Custom: keep\nVar-TOWN: Avalon\n' + BODY;

  it('adds fields before the first Var- entry and keeps other entries in order', () => {
    const out = updateTitlePage(SCRIPT, { author: 'Mike', credit: 'Written by' });
    expect(out).toBe(
      'Title: Night\nCredit: Written by\nAuthor: Mike\nVar-HERO: Jack\nX-Custom: keep\nVar-TOWN: Avalon\n' + BODY,
    );
    expect(parse(out).titlePage.map((e) => e.key)).toEqual([
      'Title', 'Credit', 'Author', 'Var-HERO', 'X-Custom', 'Var-TOWN',
    ]);
  });

  it('appends at the end when there are no variables', () => {
    expect(updateTitlePage('Title: A\nX-Y: z\n\nHi.\n', { source: 'Book' })).toBe(
      'Title: A\nX-Y: z\nSource: Book\n\nHi.\n',
    );
  });

  it('changes a value in place, case-insensitively', () => {
    const out = updateTitlePage('title: Old\nAuthor: Me\n\nHi.\n', { title: 'New' });
    expect(out).toBe('title: New\nAuthor: Me\n\nHi.\n');
  });

  it('clears a field (first, middle, last, several)', () => {
    const s = 'Title: A\nCredit: C\nAuthor: B\nVar-X: 1\n\nHi.\n';
    expect(updateTitlePage(s, { title: '' })).toBe('Credit: C\nAuthor: B\nVar-X: 1\n\nHi.\n');
    expect(updateTitlePage(s, { credit: '' })).toBe('Title: A\nAuthor: B\nVar-X: 1\n\nHi.\n');
    expect(updateTitlePage(s, { credit: '', author: '' })).toBe('Title: A\nVar-X: 1\n\nHi.\n');
    expect(updateTitlePage('Title: A\nAuthor: B\n\nHi.\n', { author: '' })).toBe('Title: A\n\nHi.\n');
  });

  it('removes the whole title page when its last field is cleared', () => {
    expect(updateTitlePage('Title: A\n\nHi.\n', { title: '' })).toBe('Hi.\n');
  });

  it('writes multi-line values in indented continuation format and reads them back', () => {
    const out = updateTitlePage('Title: A\n\nHi.\n', { contact: 'Mike\n12 Main St\n\n  555-0100 ' });
    expect(out).toBe('Title: A\nContact:\n   Mike\n   12 Main St\n   555-0100\n\nHi.\n');
    expect(titleValues(out).contact).toBe('Mike\n12 Main St\n555-0100');
    // Replacing a multi-line value replaces all of its continuation lines.
    expect(updateTitlePage(out, { contact: 'Solo' })).toBe('Title: A\nContact: Solo\n\nHi.\n');
    expect(updateTitlePage(out, { contact: '' })).toBe('Title: A\n\nHi.\n');
  });

  it('creates a title page where there was none', () => {
    expect(updateTitlePage('INT. HOUSE - DAY\n\nHi.\n', { title: 'Night', author: 'Me' })).toBe(
      'Title: Night\nAuthor: Me\n\nINT. HOUSE - DAY\n\nHi.\n',
    );
    expect(updateTitlePage('', { title: 'X' })).toBe('Title: X\n');
    expect(updateTitlePage('Hi.\n', { title: '' })).toBe('Hi.\n');
  });

  it('keeps CRLF line endings', () => {
    expect(updateTitlePage('Title: A\r\n\r\nHi.\r\n', { author: 'B' })).toBe(
      'Title: A\r\nAuthor: B\r\n\r\nHi.\r\n',
    );
  });

  it('makes no change when nothing differs', () => {
    expect(titlePageChanges(SCRIPT, {})).toEqual([]);
    expect(titlePageChanges(SCRIPT, { title: 'Night' })).toEqual([]);
  });

  it('a blank Credit stays blank; only a missing one reads as "Written by"', () => {
    expect(titleValues('Title: A\nCredit:\n\nHi.\n').credit).toBe('');
    expect(titleValues('Title: A\n\nHi.\n').credit).toBe('Written by');
  });

  it('diffTitleValues only reports changed fields; absent credit means "Written by"', () => {
    const before = titleValues('Title: A\n\nHi.\n');
    expect(before.credit).toBe('Written by');
    expect(diffTitleValues('Title: A\n\nHi.\n', before)).toEqual({});
    expect(diffTitleValues('Title: A\n\nHi.\n', { ...before, author: 'Me' })).toEqual({ author: 'Me' });
    expect(diffTitleValues('Title: A\n\nHi.\n', { ...before, credit: 'Story by' })).toEqual({ credit: 'Story by' });
  });
});

describe('find', () => {
  const text = 'Cat and cat. Concat. [[a cat note]] /* cat in the yard */ CAT!';
  it('matches case-insensitively by default, skipping notes and boneyard', () => {
    const m = findMatches(text, 'cat', DEFAULT_SEARCH);
    expect(m.map((x) => x.from)).toEqual([0, 8, 16, 58]);
  });
  it('honours match case and whole word', () => {
    expect(findMatches(text, 'cat', { ...DEFAULT_SEARCH, caseSensitive: true }).map((x) => x.from)).toEqual([8, 16]);
    expect(findMatches(text, 'cat', { ...DEFAULT_SEARCH, wholeWord: true }).map((x) => x.from)).toEqual([0, 8, 58]);
  });
  it('whole word only guards word-character ends', () => {
    const o = { ...DEFAULT_SEARCH, wholeWord: true };
    expect(findMatches('a-foo', '-foo', o)).toHaveLength(1);
    expect(findMatches('MARA(V.O.)', '(V.O.)', o)).toHaveLength(1);
    expect(findMatches('foobar foo', 'foo', o)).toHaveLength(1);
  });
  it('includes notes and boneyard when asked', () => {
    expect(findMatches(text, 'cat', { ...DEFAULT_SEARCH, includeHidden: true })).toHaveLength(6);
  });
  it('treats the query literally', () => {
    expect(findMatches('a.b axb', 'a.b', DEFAULT_SEARCH)).toHaveLength(1);
    expect(findMatches('x', '', DEFAULT_SEARCH)).toEqual([]);
  });
  it('steps to the next and previous match, wrapping', () => {
    const m = findMatches('a a a', 'a', DEFAULT_SEARCH);
    expect(stepMatch(m, { from: 0, to: 0 }, 1)).toBe(0);
    expect(stepMatch(m, { from: 0, to: 1 }, 1)).toBe(1);
    expect(stepMatch(m, { from: 4, to: 5 }, 1)).toBe(0);
    expect(stepMatch(m, { from: 0, to: 1 }, -1)).toBe(2);
    expect(stepMatch(m, { from: 2, to: 3 }, -1)).toBe(0);
  });
});

describe('undo history', () => {
  const state = (doc: string) => EditorState.create({ doc, extensions: [historyExtension()] });
  const run = (s: EditorState, cmd: typeof undo) => {
    let next = s;
    cmd({ state: s, dispatch: (tr) => (next = tr.state) });
    return next;
  };

  it('is configured for a whole session', () => {
    expect(HISTORY_CONFIG.minDepth).toBeGreaterThanOrEqual(10_000);
    expect(HISTORY_CONFIG.newGroupDelay).toBe(1000);
  });

  it('replace all is a single undo step', () => {
    let s = state('cat cat cat');
    s = s.update({ changes: { from: 11, insert: '!' }, userEvent: 'input.type' }).state;
    const spec = replaceAllSpec(s, 'cat', 'dog', DEFAULT_SEARCH)!;
    s = s.update(spec).state;
    expect(s.doc.toString()).toBe('dog dog dog!');
    s = run(s, undo);
    expect(s.doc.toString()).toBe('cat cat cat!');
    s = run(s, redo);
    expect(s.doc.toString()).toBe('dog dog dog!');
  });

  it('groups a typing burst but splits after a pause, and isolates programmatic edits', () => {
    let s = state('');
    const type = (ch: string, at: number, time: number) =>
      (s = s.update({
        changes: { from: at, insert: ch },
        userEvent: 'input.type',
        annotations: Transaction.time.of(time),
      }).state);
    type('a', 0, 1000);
    type('b', 1, 1300);
    type('c', 2, 1600);
    type('d', 3, 3000); // > 1 s later: new step
    expect(undoDepth(s)).toBe(2);
    type('e', 4, 3200); // within the burst's window...
    // ...but a programmatic edit is its own step even then, and keeps the caller's annotations.
    s = s.update(
      asUndoStep({ changes: { from: 5, insert: 'X' }, annotations: Transaction.time.of(3300) }, 'input.title'),
    ).state;
    expect(undoDepth(s)).toBe(3);
    s = run(s, undo);
    expect(s.doc.toString()).toBe('abcde');
  });

  it('title-page save is one undo step', () => {
    const doc = 'Title: A\n\nHi.\n';
    let s = state(doc);
    s = s.update(asUndoStep({ changes: titlePageChanges(doc, { author: 'Me', source: 'Book', contact: 'x\ny' }) }, 'input.title')).state;
    expect(undoDepth(s)).toBe(1);
    expect(run(s, undo).doc.toString()).toBe(doc);
  });
});

describe('spell-check', () => {
  const dir = 'node_modules/dictionary-en/';
  const checker = new SpellChecker(
    readFileSync(dir + 'index.aff', 'utf8'),
    readFileSync(dir + 'index.dic', 'utf8'),
  );
  const flagged = (text: string, opts = {}) => checker.check(text, opts).map((m) => m.word);

  const SCRIPT = [
    'Title: Zorblax Nights',
    'Author: Quillon Thwaite',
    'Var-HERO: Jack Zyx',
    'Var-TOWN: Port Avalonia',
    '',
    'EXT. PORT KRELLOW - DAY',
    '',
    'Mara Vossberg enters {{HERO}} and {{TOWN}}.',
    '',
    'MARA VOSSBERG',
    'Thwaite is here.',
    '',
  ].join('\n');

  it("doesn't flag names, locations or variable values from the script", () => {
    expect(flagged(SCRIPT)).toEqual([]);
  });

  it('flags a misspelled common word and suggests the right one', () => {
    const [m] = checker.check('Jack walks to the kitchn.\n');
    expect(m).toMatchObject({ word: 'kitchn', from: 18, to: 24 });
    expect(checker.suggest('kitchn')).toContain('kitchen');
    expect(checker.suggest('kitchn').length).toBeLessThanOrEqual(5);
  });

  it('skips acronyms, {{KEY}}, notes, boneyard, cues and numbers', () => {
    const t = 'Var-X: 1\n\nThe NASA qwzx {{KEYY}} [[qqqq]] /* zzzz */ 12A.\n\nZZZQ\nLine.\n';
    expect(flagged(t)).toEqual(['qwzx']);
  });

  it('accepts curly-apostrophe contractions', () => {
    expect(flagged('She doesn’t know. They’re here. It’s fine.\n')).toEqual([]);
    expect(flagged('She doesn\'t know. Wasn\'t it?\n')).toEqual([]);
    expect(flagged('She doesn’tt know.\n')).toEqual(['doesn’tt']);
  });

  it('honours the personal dictionary and per-script ignore list', () => {
    expect(flagged('A blorf appears.\n')).toEqual(['blorf']);
    expect(flagged('A blorf appears.\n', { personal: ['Blorf'] })).toEqual([]);
    expect(flagged('A blorf appears.\n', { ignored: ['blorf'] })).toEqual([]);
  });

  it('accepts possessives of script names', () => {
    expect(flagged(SCRIPT + '\nZorblax’s idea and Zorblax\'s plan.\n')).toEqual([]);
  });

  it('only checks the requested range', () => {
    const t = 'Aaaa bbbb.\n\nCccc dddd.\n';
    expect(checker.check(t, { range: { from: 12, to: 20 } }).map((m) => m.word)).toEqual(['Cccc', 'dddd']);
  });
});

describe('word list', () => {
  it('does not wipe the stored list when a word is added before it has loaded', async () => {
    const data = new Map([['k', JSON.stringify(['old'])]]);
    const store = {
      get: async (k: string) => data.get(k) ?? null,
      set: async (k: string, v: string) => void data.set(k, v),
    };
    const list = new WordList(store, 'k');
    await list.add('New');
    expect(list.list()).toEqual(['old', 'New']);
    expect(JSON.parse(data.get('k')!)).toEqual(['old', 'New']);
  });
});
