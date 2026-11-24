import { describe, expect, it } from 'vitest';
import {
  diff,
  firstDifference,
  mapLine,
  sideBySideRows,
  textChange,
  wrapLine,
} from '../src/engine';

describe('sideBySideRows', () => {
  it('pairs changed lines and leaves gaps for one-sided ones', () => {
    // left = this device, right = the other device
    expect(sideBySideRows('a\nmine\nextra\nz', 'a\ntheirs\nz')).toEqual([
      { left: 'a', right: 'a', changed: false },
      { left: 'mine', right: 'theirs', changed: true },
      { left: 'extra', right: null, changed: true },
      { left: 'z', right: 'z', changed: false },
    ]);
  });

  it('finds the first differing row', () => {
    expect(firstDifference(sideBySideRows('a\nb', 'a\nc'))).toBe(1);
    expect(firstDifference(sideBySideRows('a', 'a'))).toBe(0);
  });
});

describe('wrapLine', () => {
  it('breaks at spaces and never exceeds the width', () => {
    expect(wrapLine('the quick brown fox', 10)).toEqual(['the quick', 'brown fox']);
    expect(wrapLine('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapLine('', 4)).toEqual(['']);
    expect(wrapLine('  hi', 10)).toEqual(['  hi']);
  });

  it('loses no characters other than the spaces it breaks at', () => {
    const text = 'A long action line, with   several spaces and averyveryverylongword at the end.';
    for (const line of wrapLine(text, 12)) expect(line.length).toBeLessThanOrEqual(12);
    expect(wrapLine(text, 12).join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''));
  });
});

describe('mapLine', () => {
  const old = 'one\ntwo\nthree\nfour';
  it('follows a line when lines are added or removed above it', () => {
    expect(mapLine(diff(old, 'new\nnew\none\ntwo\nthree\nfour'), 2)).toBe(4);
    expect(mapLine(diff(old, 'three\nfour'), 2)).toBe(0);
  });
  it('lands where a removed line was', () => {
    expect(mapLine(diff(old, 'one\nthree\nfour'), 1)).toBe(1);
  });
  it('stays inside the new text', () => {
    expect(mapLine(diff(old, 'one'), 3)).toBe(0);
    expect(mapLine(diff(old, ''), 3)).toBe(0);
  });
});

describe('textChange', () => {
  it('replaces only what differs', () => {
    expect(textChange('abcXdef', 'abcYYdef')).toEqual({ from: 3, to: 4, insert: 'YY' });
    expect(textChange('aaa', 'aaaa')).toEqual({ from: 3, to: 3, insert: 'a' });
  });
});
