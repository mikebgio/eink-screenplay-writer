import type { StyleSpan } from './types';

/**
 * Every tunable number of the industry page-break rules (ticket 06), in one place. Positions are inches
 * from the left edge of the paper; widths are characters (Courier 12pt: 10 per inch).
 */
export const PAGE_RULES = {
  /** Scene heading, action, lyric, centered and transition share this left edge and width. */
  actionIn: 1.5,
  actionChars: 60,
  /** Character cue (also where `(MORE)` is printed). */
  cueIn: 3.7,
  cueChars: 38,
  parentheticalIn: 3.1,
  parentheticalChars: 24,
  dialogueIn: 2.5,
  dialogueChars: 35,
  /** Right edge of text, for transitions and page numbers. */
  rightEdgeIn: 7.5,
  /** Rules 4 and 5: lines that must stay on the first page and move to the next when splitting. */
  minSplitLines: 2,
  /** Rule 6: a transition may run this many lines past the bottom of a page. */
  transitionOverrunLines: 1,
  /** Rule 7: dual dialogue columns. `parentheticalIn`/`parentheticalChars` are the column's own. */
  dual: {
    left: {
      cueIn: 3.0,
      dialogueIn: 1.5,
      parentheticalIn: 2.1,
      widthChars: 28,
      parentheticalChars: 20,
      cueChars: 20,
    },
    right: {
      cueIn: 6.2,
      dialogueIn: 4.5,
      parentheticalIn: 5.1,
      widthChars: 28,
      parentheticalChars: 20,
      cueChars: 20,
    },
  },
  /** Rule 9: scene numbers. */
  sceneNumber: { leftIn: 1.0, rightEdgeIn: 7.75 },
  /** Rule 4: text printed at the foot of a split dialogue block, and appended to the next cue. */
  moreText: '(MORE)',
  contdText: "(CONT'D)",
} as const;

/** Options for `paginate`. */
export interface PaginateOptions {
  /** Rule 8: add `(CONT'D)` when the same character speaks again after only action. Default true. */
  autoContd: boolean;
  /** Rule 9: print scene numbers in both margins. Default `'off'`. */
  sceneNumbers: 'off' | 'both';
}

export const DEFAULT_PAGINATE_OPTIONS: PaginateOptions = { autoContd: true, sceneNumbers: 'off' };

/** A sentence ends at `.` `?` `!` or `…`, optionally followed by closing quotes or brackets. */
const SENTENCE_END = /[.?!…]["'”’)\]]*/g;

/**
 * Rule 4/5: offsets in `text` where a sentence ends and a following space starts, so
 * `text.slice(0, k)` is a whole number of sentences and something else follows. Ascending.
 */
export function findSentenceBreaks(text: string): number[] {
  const out: number[] = [];
  SENTENCE_END.lastIndex = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    if (end < text.length && /\s/.test(text[end]!) && text.slice(end).trim() !== '') out.push(end);
  }
  return out;
}

/** True when `text` itself ends in a sentence terminator (an element end counts as a boundary). */
export function endsSentence(text: string): boolean {
  const t = text.trimEnd();
  SENTENCE_END.lastIndex = 0;
  let last: RegExpMatchArray | undefined;
  for (const m of t.matchAll(SENTENCE_END)) last = m;
  return last !== undefined && (last.index ?? 0) + last[0].length === t.length;
}

/** Rule 4/5: a cue that already says `CONT'D` (any case, with or without the apostrophe) is left alone. */
export function hasContd(cue: string): boolean {
  return /CONT'?D/i.test(cue.replace(/[‘’]/g, "'"));
}

/** Rule 4/8: `NAME (V.O.)` → `NAME (V.O.) (CONT'D)`; unchanged when it already says CONT'D. */
export function withContd(cue: string): string {
  return hasContd(cue) ? cue : `${cue} ${PAGE_RULES.contdText}`;
}

/** The part of `styles` that overlaps `[from, to)`, shifted so `from` becomes 0. */
export function sliceStyles(
  styles: StyleSpan[] | undefined,
  from: number,
  to: number,
): StyleSpan[] | undefined {
  if (!styles) return undefined;
  const out: StyleSpan[] = [];
  for (const s of styles) {
    const a = Math.max(s.from, from);
    const b = Math.min(s.to, to);
    if (a < b) out.push({ from: a - from, to: b - from, kind: s.kind });
  }
  return out.length ? out : undefined;
}

/**
 * Rule 9: the number each scene prints. A forced `#…#` number is used as written; the rest count 1, 2,
 * 3… skipping any number that a forced heading already uses.
 */
export function assignSceneNumbers(forced: ReadonlyArray<string | undefined>): string[] {
  const used = new Set(forced.filter((f): f is string => f !== undefined));
  let next = 0;
  return forced.map((f) => {
    if (f !== undefined) return f;
    do next++;
    while (used.has(String(next)));
    return String(next);
  });
}

/**
 * Rule 8: which character cues get an automatic `(CONT'D)`. `events` lists, in script order, what
 * the document contains that matters: a cue (with the speaker's identity), an action, a scene
 * heading, or anything else that breaks the run (`other`). Returns, per cue, whether to decorate.
 */
export type ContdEvent = { kind: 'cue'; speaker: string } | { kind: 'action' | 'scene' | 'other' };

export function contdFlags(events: readonly ContdEvent[]): boolean[] {
  const flags: boolean[] = [];
  let last: string | undefined; // the character who spoke last in this scene
  let actionSince = false;
  for (const e of events) {
    if (e.kind === 'cue') {
      flags.push(last === e.speaker && actionSince);
      last = e.speaker;
      actionSince = false;
    } else if (e.kind === 'action') {
      actionSince = true;
    } else {
      last = undefined;
      actionSince = false;
    }
  }
  return flags;
}
