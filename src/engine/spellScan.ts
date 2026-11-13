import { findSpans, parse } from './parse';
import { scanTokens } from './variables';
import type { ElementType } from './types';

export interface WordRange {
  from: number;
  to: number;
  word: string;
}

/** Only these elements are spell-checked. */
const CHECKED = new Set<ElementType>(['action', 'dialogue', 'parenthetical', 'scene-heading', 'lyric']);

/** A word: letters/digits with apostrophes inside it (straight `'` or curly `’`). */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

const normalizeApostrophes = (w: string) => w.replace(/’/g, "'");

/** Lower-cased word with straight apostrophes: the form used for the accepted-word set. */
export const wordKey = (w: string) => normalizeApostrophes(w).toLowerCase();

/** Words (with their offsets) in `s`. */
export function wordsIn(s: string, base = 0): WordRange[] {
  const out: WordRange[] = [];
  for (const m of s.matchAll(WORD)) {
    out.push({ from: base + m.index, to: base + m.index + m[0].length, word: m[0] });
  }
  return out;
}

/** Skipped without asking the dictionary: contains a digit, or is all capitals with 2+ letters. */
function skipped(w: string): boolean {
  if (/\p{N}/u.test(w)) return true;
  const letters = w.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/** Blanks (keeping offsets and line breaks) notes, boneyard and `{{...}}` tokens. */
function mask(text: string): string {
  const ranges = [
    ...findSpans(text).map((s) => [s.from, s.to] as const),
    ...scanTokens(text).map((t) => [t.from, t.to] as const),
  ].sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [from, to] of ranges) {
    if (to <= pos) continue;
    const start = Math.max(from, pos);
    out += text.slice(pos, start) + text.slice(start, to).replace(/[^\r\n]/g, ' ');
    pos = to;
  }
  return out + text.slice(pos);
}

/**
 * Words that may be spell-checked: those in action, dialogue, parentheticals, scene headings and
 * lyrics, outside notes, boneyard and `{{KEY}}`, and not acronyms or cues (all capitals).
 * With `range`, only elements overlapping `[from, to]` are scanned (the visible lines plus a margin).
 */
export function checkableWords(text: string, range?: { from: number; to: number }): WordRange[] {
  const masked = mask(text);
  const out: WordRange[] = [];
  for (const el of parse(text).elements) {
    if (!CHECKED.has(el.type)) continue;
    if (range && (el.to < range.from || el.from > range.to)) continue;
    for (const w of wordsIn(masked.slice(el.from, el.to), el.from)) {
      if (!skipped(w.word)) out.push(w);
    }
  }
  return out;
}

/**
 * Words the script itself teaches the checker (lower-cased, straight apostrophes): character names,
 * scene-heading locations, variable keys and values, and the title page's Title and Author.
 */
export function scriptWords(text: string): Set<string> {
  const doc = parse(text);
  const out = new Set<string>();
  const add = (s: string) => {
    for (const w of wordsIn(s)) out.add(wordKey(w.word));
  };
  for (const el of doc.elements) {
    if (el.type === 'character') add(el.identity ?? el.text);
    else if (el.type === 'scene-heading') add(el.text);
  }
  for (const e of doc.titlePage) {
    const k = e.key.toLowerCase();
    if (k.startsWith('var-')) {
      add(e.key.slice(4).replace(/_/g, ' '));
      add(e.value);
    } else if (k === 'title' || k === 'author') add(e.value);
  }
  return out;
}
