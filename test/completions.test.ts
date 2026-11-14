import { describe, expect, it } from 'vitest';
import { characterNames, splitHeading, suggestionsAt } from '../src/engine';

/** `a|b`: the cursor marks where the suggestions are asked for. */
function at(src: string, mode: 'character' | null = null) {
  const cursor = src.indexOf('|');
  const text = src.replace('|', '');
  const r = suggestionsAt(text, cursor, mode);
  return r && { from: r.from, labels: r.options.map((o) => o.label), r, text };
}

const SCRIPT = [
  'Title: T',
  'Var-HERO: Jack Reyes',
  'Var-TOWN: Port Avalon',
  '',
  'INT. KITCHEN - DAY',
  '',
  'ANN',
  'Hi.',
  '',
  'BOB',
  'Hey.',
  '',
  'ANN',
  'Again.',
  '',
  '{{HERO}}',
  'Yo.',
  '',
  'EXT. GARDEN - DUSK',
  '',
  'ANN',
  'Third.',
  '',
  'INT. KITCHEN - NIGHT',
  '',
].join('\n');

describe('character autocomplete', () => {
  it('orders names by how often they appear', () => {
    expect(characterNames(SCRIPT)).toEqual(['ANN', 'BOB', '{{HERO}}']);
  });
  it('includes {{VAR}} cues by their identity', () => {
    expect(characterNames('{{HERO}} (V.O.)\nHi.\n\n{{HERO}}\nHey.')).toEqual(['{{HERO}}']);
  });
  it('is offered in character mode', () => {
    const r = at(SCRIPT + '\nB|', 'character')!;
    expect(r.labels).toEqual(['ANN', 'BOB', '{{HERO}}']);
    expect(r.from).toBe(SCRIPT.length + 1);
  });
  it('is offered after an @ forcing mark', () => {
    const r = at(SCRIPT + '\n@A|')!;
    expect(r.labels).toContain('ANN');
    expect(r.from).toBe(SCRIPT.length + 2);
  });
  it('is offered on an existing cue line, excluding the line being edited', () => {
    const r = at('ANN\nHi.\n\nBO|\nHey.')!;
    expect(r.labels).toEqual(['ANN']);
  });
  it('closes once the name is complete', () => {
    expect(at(SCRIPT + '\nBOB|', 'character')!.labels).toEqual(['ANN', '{{HERO}}']);
    expect(at('ANN\nHi.\n\nANN|\nHey.')).toBeNull();
  });
  it('is not offered on dialogue or action', () => {
    expect(at('ANN\nHi th|')).toBeNull();
    expect(at('x\n\nHe ran to|\n\nz')).toBeNull();
  });
});

describe('scene heading autocomplete', () => {
  it('offers the prefixes once two characters are typed', () => {
    expect(at('x\n\nIN|')!.labels).toEqual(['INT.', 'INT./EXT.']);
    expect(at('x\n\ni/|')!.labels).toEqual(['I/E.']);
    expect(at('x\n\nes|')!.labels).toEqual(['EST.']);
    expect(at('x\n\nI|')).toBeNull();
  });
  it('inserts the prefix with a trailing space', () => {
    const r = at('x\n\nEX|')!;
    expect(r.r.options[0]!.apply).toBe('EXT. ');
  });
  it('lists every prefix for a typed "e" only after the second character', () => {
    expect(at('x\n\nE|')).toBeNull();
    expect(at('x\n\nEX|')!.labels).toEqual(['EXT.']);
  });
  it('offers locations already used, most frequent first', () => {
    const text = SCRIPT + '\nINT. |';
    const r = at(text)!;
    expect(r.labels).toEqual(['KITCHEN', 'GARDEN']);
    expect(r.from).toBe(text.length - 1);
  });
  it('filters locations by what is typed and drops an exact match', () => {
    expect(at(SCRIPT + '\nINT. KIT|')!.labels).toEqual(['KITCHEN', 'GARDEN']);
    expect(at(SCRIPT + '\nINT. GARDEN|')!.labels).toEqual(['KITCHEN']);
  });
  it('does not offer the heading being edited as a location', () => {
    expect(at('INT. KITCH|\n\nHi.')).toBeNull();
  });
  it('offers times of day after " - ", then used ones', () => {
    const r = at(SCRIPT + '\nINT. KITCHEN - |')!;
    expect(r.labels).toEqual(['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'EVENING', 'DUSK']);
    expect(at(SCRIPT + '\nINT. KITCHEN - M|')!.from).toBe(SCRIPT.length + '\nINT. KITCHEN - '.length);
  });
  it('splits a heading at its last " - "', () => {
    expect(splitHeading('MAIN ST - KITCHEN - DAY')).toEqual({ location: 'MAIN ST - KITCHEN', time: 'DAY' });
    expect(splitHeading('GARDEN')).toEqual({ location: 'GARDEN' });
  });
});

describe('variable autocomplete', () => {
  it('lists keys with their values after {{', () => {
    const r = at(SCRIPT + '\n\nHe meets {{|')!;
    expect(r.labels).toEqual(['HERO', 'TOWN']);
    expect(r.r.options.map((o) => o.detail)).toEqual(['Jack Reyes', 'Port Avalon']);
    expect(r.r.options[0]!.apply).toBe('HERO}}');
  });
  it('replaces the typed part of the key', () => {
    const text = SCRIPT + '\n\nHe meets {{HE';
    const r = suggestionsAt(text, text.length)!;
    expect(r.from).toBe(text.length - 2);
    expect(r.options.map((o) => o.label)).toEqual(['HERO', 'TOWN']); // CodeMirror filters by the typed part
  });
  it('does not add }} when it is already there', () => {
    const r = at('Var-A: 1\n\nx {{|}}')!;
    expect(r.r.options[0]!.apply).toBe('A');
  });
  it('includes keys that are used but not defined, marked undefined', () => {
    const r = at('Var-A: 1\n\n{{NEW}} and {{|')!;
    expect(r.labels).toEqual(['A', 'NEW']);
    expect(r.r.options[1]!.detail).toBe('undefined');
  });
  it('closes when the key is complete', () => {
    expect(at(SCRIPT + '\n\nHe meets {{TOWN|')!.labels).toEqual(['HERO']);
  });
  it('wins over other sources on a character cue line', () => {
    expect(at(SCRIPT + '\n{{H|', 'character')!.labels).toEqual(['HERO', 'TOWN']);
  });
});
