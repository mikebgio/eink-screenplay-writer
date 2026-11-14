import { describe, expect, it } from 'vitest';
import {
  capitalizeInput,
  classifyLines,
  enter,
  force,
  parse,
  tab,
  type EditState,
  type ForceKind,
  type Mode,
} from '../src/engine';

/** `a|b` ↔ { text: 'ab', cursor: 1 }. `{C}` / `{T}` at the very start sets character / transition mode. */
function st(src: string): EditState {
  let mode: Mode = null;
  let s = src;
  if (s.startsWith('{C}')) {
    mode = 'character';
    s = s.slice(3);
  }
  if (s.startsWith('{T}')) {
    mode = 'transition';
    s = s.slice(3);
  }
  const cursor = s.indexOf('|');
  return { text: s.replace('|', ''), cursor, mode };
}
function show(s: EditState | null): string {
  if (!s) return 'null';
  const m = s.mode === 'character' ? '{C}' : s.mode === 'transition' ? '{T}' : '';
  return `${m}${s.text.slice(0, s.cursor)}|${s.text.slice(s.cursor)}`;
}

describe('Enter', () => {
  const cases: [string, string, string][] = [
    ['scene heading → blank line, new line', 'INT. HOUSE - DAY|', 'INT. HOUSE - DAY\n\n|'],
    ['action → blank line, new line', 'He runs.|', 'He runs.\n\n|'],
    ['character → new line, no blank', 'JACK|\nHello.', 'JACK\n|\nHello.'],
    ['parenthetical → new line, no blank', 'JACK\n(quietly)|\nHello.', 'JACK\n(quietly)\n|\nHello.'],
    ['dialogue → blank line, new line', 'JACK\nHello there.|', 'JACK\nHello there.\n\n|'],
    ['transition → blank line, new line', 'He leaves.\n\nCUT TO:|\n\nINT. X - DAY', 'He leaves.\n\nCUT TO:\n\n|\n\nINT. X - DAY'],
    ['before the closing ) of a parenthetical is the end', 'JACK\n(quietly|)\nHello.', 'JACK\n(quietly)\n|\nHello.'],
    ['mid-line just splits', 'He ru|ns.', 'He ru\n|ns.'],
    ['mid-line in a heading splits too', 'INT. HO|USE - DAY', 'INT. HO\n|USE - DAY'],
    ['empty line stays a plain newline', 'He runs.\n\n|', 'He runs.\n\n\n|'],
    ['centered text gets a blank line', '> THE END <|', '> THE END <\n\n|'],
    ['lyric is a plain newline', '~la la|', '~la la\n|'],
    ['character mode finishes the cue', '{C}Jack|', 'JACK\n|'],
    ['character mode adds @ when the cue has no letters', '{C}007|', '@007\n|']
    ,['character mode keeps digits in a normal cue', '{C}r2-d2|', 'R2-D2\n|'],
    ['transition mode capitalises and forces', '{T}fade out|', '>FADE OUT\n\n|'],
    ['transition mode needs no mark for …TO:', '{T}cut to:|', 'CUT TO:\n\n|'],
    ['character mode on an empty line cancels', '{C}|', '\n|'],
    ['dialogue in a pair keeps the cue line', 'JACK\nHi.\n\nANNA\nHey.|', 'JACK\nHi.\n\nANNA\nHey.\n\n|'],
  ];
  it.each(cases)('%s', (_n, input, expected) => {
    expect(show(enter(st(input)))).toBe(expected);
  });
  it('a finished cue directly followed by dialogue parses as a cue', () => {
    const r = enter(st('{C}Jack|'));
    const doc = parse(r.text + 'Hello.');
    expect(doc.elements.map((e) => e.type)).toEqual(['character', 'dialogue']);
  });
});

describe('Tab', () => {
  const cases: [string, string, string][] = [
    ['empty line after a blank line → character mode', 'He runs.\n\n|', '{C}He runs.\n\n|'],
    ['empty first line → character mode', '|', '{C}|'],
    ['character mode → transition mode', '{C}He runs.\n\n|', '{T}He runs.\n\n|'],
    ['transition mode → back to plain', '{T}He runs.\n\n|', 'He runs.\n\n|'],
    ['empty line under a cue → parenthetical', 'JACK\n|', 'JACK\n(|)'],
    ['empty line under dialogue → parenthetical', 'JACK\nHello.\n|', 'JACK\nHello.\n(|)'],
    ['empty parenthetical → back to dialogue', 'JACK\n(|)', 'JACK\n|'],
    ['Shift+Tab: plain → transition mode', 'He runs.\n\n|', '{T}He runs.\n\n|'],
    ['Shift+Tab: transition → character mode', '{T}He runs.\n\n|', '{C}He runs.\n\n|'],
    ['Shift+Tab: character → plain', '{C}He runs.\n\n|', 'He runs.\n\n|'],
    ['under an action line does nothing', 'He runs.\n|', 'null'],
    ['on a non-empty line does nothing', 'He ru|ns.', 'null'],
  ];
  it.each(cases)('%s', (name, input, expected) => {
    expect(show(tab(st(input), name.startsWith('Shift+Tab')))).toBe(expected);
  });
  it('a filled parenthetical is not removed', () => {
    expect(tab(st('JACK\n(be|at)'))).toBeNull();
  });
  it('Shift+Tab under a cue does nothing', () => {
    expect(tab(st('JACK\n|'), true)).toBeNull();
  });
});

describe('force element type', () => {
  const cases: [ForceKind, string, string, string][] = [
    ['scene-heading', 'lowercase heading', 'house - day|', '.HOUSE - DAY|'],
    ['scene-heading', 'already a heading', 'int. house - day|', 'INT. HOUSE - DAY|'],
    ['scene-heading', 'forced again removes the dot', '.HOUSE - DAY|', 'HOUSE - DAY|'],
    ['action', 'heading-like action needs !', 'INT. HOUSE|', '!INT. HOUSE|'],
    ['action', 'plain text needs no mark', 'Hello|', 'Hello|'],
    ['action', 'forced again removes !', '!INT. HOUSE|', 'INT. HOUSE|'],
    ['action', 'from a forced cue', '@jack|', 'jack|'],
    ['character', 'capitalises (no mark needed)', 'Jack|', 'JACK|'],
    ['character', 'no @ for a plain uppercase name', 'JACK|', 'JACK|'],
    ['character', 'no letters needs @', '007|', '@007|'],
    ['character', 'forced again removes @', '@JACK|', 'JACK|'],
    ['parenthetical', 'wraps in parentheses', 'beat|', '(beat|)'],
    ['parenthetical', 'again unwraps', '(beat)|', 'beat|'],
    ['dialogue', 'strips parentheses', '(beat)|', 'beat|'],
    ['dialogue', 'strips a cue mark', '@JACK|', 'JACK|'],
    ['dialogue', 'plain text is left alone', 'Hello|', 'Hello|'],
    ['transition', 'forces and capitalises', 'fade out|', '>FADE OUT|'],
    ['transition', 'no mark needed for TO:', 'cut to:|', 'CUT TO:|'],
    ['transition', 'forced again removes >', '>FADE OUT|', 'FADE OUT|'],
    ['centered', 'wraps', 'THE END|', '> THE END| <'],
    ['centered', 'again unwraps', '> THE END <|', 'THE END|'],
    ['lyric', 'prefixes ~', 'la la|', '~la la|'],
    ['lyric', 'again removes ~', '~la la|', 'la la|'],
    ['scene-heading', 'swaps a transition mark', '>CUT|', '.CUT|'],
    ['character', 'cursor keeps its place in the text', 'ja|ck', 'JA|CK'],
  ];
  it.each(cases)('%s: %s', (kind, _n, input, expected) => {
    expect(show(force(st(input), kind))).toBe(expected);
  });
  it('applies to the cursor line only', () => {
    expect(show(force(st('a\n\nfade out|\n\nb'), 'transition'))).toBe('a\n\n>FADE OUT|\n\nb');
  });
  const empties: [ForceKind, string][] = [
    ['character', '{C}|'],
    ['transition', '{T}|'],
    ['parenthetical', '(|)'],
    ['centered', '> | <'],
    ['lyric', '~|'],
    ['scene-heading', '|'],
    ['action', '|'],
  ];
  it.each(empties)('on an empty line: %s', (kind, expected) => {
    expect(show(force(st('|'), kind))).toBe(expected);
  });
  it('forced lines parse as the requested element', () => {
    const kinds: [ForceKind, string][] = [
      ['scene-heading', 'scene-heading'],
      ['character', 'character'],
      ['transition', 'transition'],
      ['centered', 'centered'],
      ['lyric', 'lyric'],
    ];
    for (const [kind, expected] of kinds) {
      const r = force(st('x\n\n1234|'), kind);
      // A cue needs a line after it; the others need a blank one.
      const body = `${r.text}${kind === 'character' ? '\nhello' : '\n\nend'}`;
      expect(classifyLines(body)[2]).toBe(expected);
    }
  });
});

describe('capitalising as you type', () => {
  const type = (before: string, at: number, ch: string, mode: Mode = null) => {
    const r = capitalizeInput(before.slice(0, at) + before.slice(at), { from: at, to: at, insert: ch }, mode);
    const after = before.slice(0, at) + ch + before.slice(at);
    return r ? after.slice(0, r.from) + r.insert + after.slice(r.to) : after;
  };
  it('capitalises the whole line when the heading prefix is completed', () => {
    expect(type('int', 3, '.')).toBe('INT.');
    expect(type('ext', 3, '.')).toBe('EXT.');
    expect(type('est', 3, '.')).toBe('EST.');
    expect(type('i/e', 3, ' ')).toBe('I/E ');
    expect(type('Int. my hou', 3, '.')).toBe('Int. my hou'.slice(0, 3) + '.' + 'Int. my hou'.slice(3)); // not a new prefix
  });
  it('keeps capitalising on a heading line', () => {
    expect(type('INT. HOUSE', 10, 's')).toBe('INT. HOUSES');
    expect(type('INT. HOUSE - ', 13, 'd')).toBe('INT. HOUSE - D');
  });
  it('does not touch ordinary text', () => {
    expect(type('He ran', 6, 's')).toBe('He rans');
    expect(type('interior', 8, 's')).toBe('interiors');
  });
  it('capitalises in character and transition mode', () => {
    expect(type('', 0, 'j', 'character')).toBe('J');
    expect(type('J', 1, 'a', 'character')).toBe('JA');
    expect(type('', 0, 'f', 'transition')).toBe('F');
  });
  it('capitalises typed text on forced cue, transition and heading lines', () => {
    expect(type('@JAC', 4, 'k')).toBe('@JACK');
    expect(type('>FADE', 5, 'x')).toBe('>FADEX');
    expect(type('.HOUSE', 6, 'x')).toBe('.HOUSEX');
  });
  it('capitalises typed text on a recognised cue line', () => {
    const before = 'x\n\nJACK\nHello.';
    expect(type(before, 7, 'a')).toBe('x\n\nJACKA\nHello.');
  });
  it('leaves dialogue and lowercase action alone', () => {
    expect(type('x\n\nJACK\nHello', 13, 'o')).toBe('x\n\nJACK\nHelloo');
  });
  it('ignores multi-line insertions (pasted text is never changed)', () => {
    expect(capitalizeInput('int.', { from: 4, to: 4, insert: 'a\nb' }, null)).toBeNull();
    expect(capitalizeInput('', { from: 0, to: 0, insert: '' }, 'character')).toBeNull();
  });
});

/** Types a whole scene using only the keys: Tab, Enter, text and the force shortcuts. */
describe('typing a scene with the keyboard only', () => {
  function keyboard() {
    let s: EditState = { text: '', cursor: 0, mode: null };
    const type = (str: string) => {
      for (const ch of str) {
        const change = { from: s.cursor, to: s.cursor, insert: ch };
        const fix = capitalizeInput(s.text, change, s.mode ?? null);
        let text = s.text.slice(0, s.cursor) + ch + s.text.slice(s.cursor);
        if (fix) text = text.slice(0, fix.from) + fix.insert + text.slice(fix.to);
        s = { text, cursor: s.cursor + 1, mode: s.mode };
      }
    };
    return {
      type,
      enter: () => (s = enter(s)),
      tab: (shift = false) => (s = tab(s, shift) ?? s),
      force: (k: ForceKind) => (s = force(s, k)),
      get text() {
        return s.text;
      },
    };
  }
  it('produces Fountain that parses into the expected elements', () => {
    const k = keyboard();
    k.type('int. kitchen - day');
    k.enter();
    k.type('Jack makes coffee.');
    k.enter();
    k.tab(); // character mode
    k.type('jack');
    k.enter();
    k.tab(); // parenthetical
    k.type('yawning');
    k.tab(); // inside "(yawning)": not empty, so no change
    k.enter();
    k.type('Morning.');
    k.enter();
    k.tab();
    k.tab(); // transition mode
    k.type('cut to:');
    k.enter();
    k.type('ext. garden - night');
    expect(k.text).toBe(
      'INT. KITCHEN - DAY\n\nJack makes coffee.\n\nJACK\n(yawning)\nMorning.\n\nCUT TO:\n\nEXT. GARDEN - NIGHT',
    );
    expect(parse(k.text).elements.map((e) => e.type)).toEqual([
      'scene-heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'scene-heading',
    ]);
  });
});
