import { findSpans } from './parse';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Also match inside `[[notes]]` and boneyard. */
  includeHidden: boolean;
}

export const DEFAULT_SEARCH: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  includeHidden: false,
};

export interface Match {
  from: number;
  to: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Literal matches of `query` in `text`, in order and non-overlapping. */
export function findMatches(text: string, query: string, opts: SearchOptions): Match[] {
  if (query === '') return [];
  const word = '[\\p{L}\\p{N}_]';
  const src = opts.wholeWord
    ? `(?<!${word})${escape(query)}(?!${word})`
    : escape(query);
  const re = new RegExp(src, opts.caseSensitive ? 'gu' : 'giu');
  const hidden = opts.includeHidden ? [] : findSpans(text);
  const out: Match[] = [];
  for (const m of text.matchAll(re)) {
    const from = m.index;
    const to = from + m[0].length;
    if (to === from) continue;
    if (hidden.some((s) => from < s.to && to > s.from)) continue;
    out.push({ from, to });
  }
  return out;
}

/** Index of the match to go to from a selection: the next one after it (or previous, before it), wrapping. */
export function stepMatch(
  matches: Match[],
  sel: { from: number; to: number },
  dir: 1 | -1,
): number {
  if (matches.length === 0) return -1;
  if (dir === 1) {
    const i = matches.findIndex((m) => m.from >= sel.to);
    return i < 0 ? 0 : i;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i]!.to <= sel.from) return i;
  }
  return matches.length - 1;
}

/** Index of the match that equals the selection, or -1. */
export function selectedMatch(matches: Match[], sel: { from: number; to: number }): number {
  return matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
}
