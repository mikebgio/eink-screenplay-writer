import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paginate, parse } from '../src/engine';

const types = (text: string) => parse(text).elements.map((e) => e.type);

describe('parse', () => {
  it('classifies scene headings, including forced ones', () => {
    expect(types('INT. HOUSE - DAY')).toEqual(['scene-heading']);
    expect(types('EXT. YARD - NIGHT')).toEqual(['scene-heading']);
    expect(types('I/E CAR - DAY')).toEqual(['scene-heading']);
    const forced = parse('.THE MOON');
    expect(forced.elements[0]).toMatchObject({ type: 'scene-heading', text: 'THE MOON' });
  });

  it('classifies a character cue followed by dialogue', () => {
    expect(types('\nMARA\nHello there.\nSecond line.')).toEqual(['character', 'dialogue']);
    const doc = parse('MARA\nHello there.\nSecond line.');
    expect(doc.elements[1]).toMatchObject({
      text: 'Hello there.\nSecond line.',
      startLine: 1,
      endLine: 2,
    });
  });

  it('treats everything else as action, including an all-caps line with nothing after it', () => {
    expect(types('She walks in.')).toEqual(['action']);
    expect(types('SMASH CUT TO BLACK')).toEqual(['action']);
  });

  it('keeps source line ranges for each element', () => {
    const doc = parse('INT. A - DAY\n\nAction one.\nAction two.\n\nBOB\nHi.');
    expect(doc.elements.map((e) => [e.type, e.startLine, e.endLine])).toEqual([
      ['scene-heading', 0, 0],
      ['action', 2, 3],
      ['character', 5, 5],
      ['dialogue', 6, 6],
    ]);
  });

  it('parses the sample fixture', () => {
    const text = readFileSync('test/fixtures/sample.fountain', 'utf8');
    expect(types(text)).toEqual([
      'scene-heading',
      'action',
      'character',
      'dialogue',
      'scene-heading',
      'scene-heading',
      'action',
    ]);
  });
});

describe('paginate', () => {
  it('wraps long action at 60 characters', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const lines = paginate(parse(long)).pages[0]!.lines;
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(l.text.length).toBeLessThanOrEqual(60);
      expect(l.x).toBe(1.5);
    }
    expect(lines.some((l) => l.text.length > 50)).toBe(true);
  });

  it('wraps long dialogue at 35 characters, indented 2.5 inches', () => {
    const long = Array.from({ length: 30 }, (_, i) => `talk${i}`).join(' ');
    const lines = paginate(parse(`BOB\n${long}`)).pages[0]!.lines;
    const dialogue = lines.filter((l) => l.type === 'dialogue');
    expect(dialogue.length).toBeGreaterThan(1);
    for (const l of dialogue) {
      expect(l.text.length).toBeLessThanOrEqual(35);
      expect(l.x).toBe(2.5);
    }
    expect(lines.find((l) => l.type === 'character')!.x).toBe(3.7);
  });

  it('puts one blank line between elements', () => {
    const lines = paginate(parse('INT. A - DAY\n\nHe waits.')).pages[0]!.lines;
    expect(lines[1]!.y - lines[0]!.y).toBeCloseTo(2 / 6);
  });

  it('produces more than one page for a 200-line script, with 54 body lines per page', () => {
    const script = Array.from({ length: 200 }, (_, i) => `Line ${i}`).join('\n\n');
    const paged = paginate(parse(script));
    expect(paged.pageCount).toBeGreaterThan(1);
    expect(paged.pages[0]!.lines.length).toBeLessThanOrEqual(54);
    expect(paged.pages.map((p) => p.number)).toEqual(paged.pages.map((_, i) => i + 1));
  });

  it('returns one empty page for an empty document', () => {
    const paged = paginate(parse(''));
    expect(paged.pageCount).toBe(1);
    expect(paged.pages[0]!.lines).toEqual([]);
  });
});
