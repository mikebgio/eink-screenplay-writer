import type {
  ElementType,
  LineClass,
  ScriptDocument,
  ScriptElement,
  SourceSpan,
  StyleSpan,
  TitleEntry,
} from './types';

const SCENE_PREFIX = /^(INT\.?\/EXT|INT|EXT|EST|I\/E)(\.|\s)/i;
const SCENE_NUMBER = /\s*#([^#\s][^#]*?)#\s*$/;
const TITLE_KEY = /^([A-Za-z0-9][A-Za-z0-9 _-]*?):[ \t]*(.*)$/;
const GROUP_TYPES = new Set<ElementType>(['character', 'parenthetical', 'dialogue']);
const EMPHASIS_TYPES = new Set<ElementType>([
  'action',
  'dialogue',
  'parenthetical',
  'lyric',
  'centered',
]);

interface Line {
  text: string;
  start: number;
  /** Exclusive; the line break is not included. */
  end: number;
}

/** An element under construction: the source lines it covers and their marker-stripped text. */
interface Draft {
  type: ElementType;
  lines: number[];
  parts: string[];
  forced?: boolean;
  level?: number;
  dual?: 'left' | 'right';
  extension?: string;
  /** Pre-computed display text (notes and boneyard). */
  fixedText?: string;
}

export interface Analysis {
  doc: ScriptDocument;
  lines: LineClass[];
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  const re = /\r\n|\n/g;
  let pos = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ text: text.slice(pos, m.index), start: pos, end: m.index });
    pos = m.index + m[0].length;
  }
  out.push({ text: text.slice(pos), start: pos, end: text.length });
  return out;
}

/** Boneyard first (it hides everything inside it), then notes, which may not contain a blank line. */
function findSpans(text: string): SourceSpan[] {
  if (!text.includes('/*') && !text.includes('[[')) return [];
  const spans: SourceSpan[] = [];
  let masked = text;
  for (const m of text.matchAll(/\/\*[\s\S]*?(?:\*\/|$)/g)) {
    const from = m.index;
    const to = from + m[0].length;
    spans.push({ from, to, kind: 'boneyard' });
    masked = masked.slice(0, from) + m[0].replace(/[^\r\n]/g, ' ') + masked.slice(to);
  }
  for (const m of masked.matchAll(/\[\[(?:(?!\r?\n[ \t]*\r?\n)[\s\S])*?\]\]/g)) {
    spans.push({ from: m.index, to: m.index + m[0].length, kind: 'note' });
  }
  return spans.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** Text of `line` without the given absolute ranges; a gap left between two spaces loses one. */
function removeRanges(text: string, line: Line, ranges: [number, number][]): string {
  let out = '';
  let pos = line.start;
  for (const [a, b] of ranges) {
    if (b <= pos) continue;
    out += text.slice(pos, Math.max(a, pos));
    pos = b;
    if (pos < line.end && /\s$/.test(out) && /\s/.test(text[pos]!)) pos++;
  }
  return out + text.slice(pos, line.end);
}

function parseTitlePage(lines: Line[]): { entries: TitleEntry[]; end: number } | null {
  if (!TITLE_KEY.test(lines[0]?.text ?? '')) return null;
  const entries: TitleEntry[] = [];
  let i = 0;
  for (; i < lines.length && lines[i]!.text.trim() !== ''; i++) {
    const t = lines[i]!.text;
    if (/^[ \t]/.test(t)) {
      const last = entries[entries.length - 1];
      if (!last) return null;
      last.value = last.value === '' ? t.trim() : `${last.value}\n${t.trim()}`;
      continue;
    }
    const m = TITLE_KEY.exec(t);
    if (!m) return null;
    entries.push({ key: m[1]!.trim(), value: m[2]!.trim() });
  }
  // "CUT TO:" on its own is a transition, not a title page.
  if (entries.length === 1 && entries[0]!.value === '') return null;
  return { entries, end: i };
}

interface Cue {
  name: string;
  display: string;
  extension?: string;
  dual: boolean;
}

/** Splits a character cue into name, extension(s) and the dual-dialogue `^`. */
function parseCue(s: string): Cue {
  let t = s;
  let dual = false;
  if (t.endsWith('^')) {
    dual = true;
    t = t.slice(0, -1).trimEnd();
  }
  const exts: string[] = [];
  let name = t;
  while (name.endsWith(')')) {
    const open = name.lastIndexOf('(');
    if (open < 0) break;
    exts.unshift(name.slice(open + 1, -1).trim());
    name = name.slice(0, open).trimEnd();
  }
  return { name, display: t, extension: exts.length ? exts.join(' ') : undefined, dual };
}

function isValidCue(name: string): boolean {
  return /[A-Z]/.test(name) && name === name.toUpperCase();
}

type Mark = { ch: '*' | '_'; n: number; start: number; end: number; open: boolean; close: boolean };

/** Removes emphasis markers and `\*` `\_` escapes; returns style spans over the cleaned text. */
function extractEmphasis(src: string): { text: string; styles: StyleSpan[] } {
  if (!/[*_\\]/.test(src)) return { text: src, styles: [] };
  type Tok = string | Mark;
  const toks: Tok[] = [];
  let buf = '';
  const flush = () => {
    if (buf) toks.push(buf);
    buf = '';
  };
  for (let i = 0; i < src.length;) {
    const c = src[i]!;
    if (c === '\\' && (src[i + 1] === '*' || src[i + 1] === '_')) {
      buf += src[i + 1];
      i += 2;
    } else if (c === '*' || c === '_') {
      let j = i + 1;
      if (c === '*') while (src[j] === '*') j++;
      const prev = src[i - 1];
      const next = src[j];
      let open = next !== undefined && !/\s/.test(next);
      let close = prev !== undefined && !/\s/.test(prev);
      if (c === '_') {
        // Underscores inside words (snake_case) are literal.
        open &&= prev === undefined || !/\w/.test(prev);
        close &&= next === undefined || !/\w/.test(next);
      }
      flush();
      toks.push({ ch: c, n: j - i, start: i, end: j, open, close });
      i = j;
    } else {
      buf += c;
      i++;
    }
  }
  flush();

  // Pair markers: a closer matches the nearest opener of the same kind and length.
  const partner = new Map<Mark, Mark>();
  const stack: Mark[] = [];
  for (const t of toks) {
    if (typeof t === 'string' || t.n > 3) continue;
    if (t.close) {
      let k = stack.length - 1;
      while (k >= 0 && !(stack[k]!.ch === t.ch && stack[k]!.n === t.n)) k--;
      if (k >= 0) {
        partner.set(t, stack[k]!);
        partner.set(stack[k]!, t);
        stack.length = k;
        continue;
      }
    }
    if (t.open) stack.push(t);
  }

  let out = '';
  const styles: StyleSpan[] = [];
  const openAt = new Map<Mark, number>();
  for (const t of toks) {
    if (typeof t === 'string') {
      out += t;
      continue;
    }
    const p = partner.get(t);
    if (!p) {
      out += t.ch.repeat(t.n);
    } else if (p.start > t.start) {
      openAt.set(t, out.length);
    } else {
      const from = openAt.get(p)!;
      if (t.ch === '_') styles.push({ from, to: out.length, kind: 'underline' });
      if (t.ch === '*' && t.n >= 2) styles.push({ from, to: out.length, kind: 'bold' });
      if (t.ch === '*' && t.n !== 2) styles.push({ from, to: out.length, kind: 'italic' });
    }
  }
  styles.sort((a, b) => a.from - b.from || b.to - a.to);
  return { text: out, styles };
}

/** The single implementation behind both `parse` and `classifyLines`. */
export function analyze(text: string): Analysis {
  const lines = splitLines(text);
  const n = lines.length;
  const lineClasses: LineClass[] = new Array<LineClass>(n).fill('blank');

  // --- title page ---
  const title = parseTitlePage(lines);
  const bodyStart = title ? title.end : 0;
  for (let i = 0; i < bodyStart; i++) lineClasses[i] = 'title-page';

  // --- notes and boneyard ---
  const spans = findSpans(text);
  const clean = lines.map((l) => l.text);
  const lineSpan: (number | undefined)[] = new Array<number | undefined>(n).fill(undefined);
  if (spans.length > 0) {
    const lineAt = (offset: number): number => {
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lines[mid]!.start <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const bounds = spans.map((sp) => [lineAt(sp.from), lineAt(Math.max(sp.from, sp.to - 1))]);
    const removals: [number, number][][] = [];
    spans.forEach((sp, idx) => {
      const [sL, eL] = bounds[idx]!;
      for (let i = sL!; i <= eL!; i++) {
        (removals[i] ??= []).push([
          Math.max(sp.from, lines[i]!.start),
          Math.min(sp.to, lines[i]!.end),
        ]);
      }
    });
    removals.forEach((r, i) => {
      clean[i] = removeRanges(text, lines[i]!, r);
    });
    spans.forEach((_, idx) => {
      const [sL, eL] = bounds[idx]!;
      for (let i = Math.max(sL!, bodyStart); i <= eL!; i++) {
        if (lineSpan[i] === undefined && clean[i]!.trim() === '') lineSpan[i] = idx;
      }
    });
  }

  const isBlank = (i: number) => lineSpan[i] === undefined && clean[i]!.trim() === '';
  /** Index of the next line that is not a whole-line note/boneyard. */
  const nextReal = (i: number): number => {
    let j = i + 1;
    while (j < n && lineSpan[j] !== undefined) j++;
    return j;
  };

  // --- elements ---
  const drafts: Draft[] = [];
  let prevBlank = true;
  let inGroup = false; // inside a character/dialogue group
  let cur: Draft | null = null; // element that the next non-blank line extends
  let dualRight = false;
  let lastChar = -1;
  let spanDraft: Draft | null = null;

  const push = (d: Draft): Draft => {
    if (dualRight && GROUP_TYPES.has(d.type)) d.dual = 'right';
    drafts.push(d);
    return d;
  };

  const startCharacter = (i: number, cueText: string, forced: boolean) => {
    const cue = parseCue(cueText);
    const d: Draft = {
      type: 'character',
      lines: [i],
      parts: [cue.display],
      extension: cue.extension,
    };
    if (forced) d.forced = true;
    dualRight = false;
    if (cue.dual && lastChar >= 0) {
      const between = drafts.slice(lastChar);
      // A pair has exactly two halves: a group that is already dual can't start another pair.
      const adjacent = between.every(
        (x) =>
          (GROUP_TYPES.has(x.type) && x.dual === undefined) ||
          x.type === 'note' ||
          x.type === 'boneyard',
      );
      if (adjacent) {
        for (const x of between) if (GROUP_TYPES.has(x.type)) x.dual ??= 'left';
        dualRight = true;
      }
    }
    lastChar = drafts.length;
    push(d);
    inGroup = true;
    cur = null;
  };

  for (let i = bodyStart; i < n; i++) {
    const idx = lineSpan[i];
    if (idx !== undefined) {
      // Whole-line notes/boneyard are elements of their own and are transparent to the block state.
      const sp = spans[idx]!;
      if (spanDraft && spanDraft.type === sp.kind && lineSpan[i - 1] === idx) {
        spanDraft.lines.push(i);
      } else {
        spanDraft = { type: sp.kind, lines: [i], parts: [] };
        drafts.push(spanDraft);
      }
      cur = null;
      continue;
    }
    spanDraft = null;
    if (isBlank(i)) {
      prevBlank = true;
      inGroup = false;
      cur = null;
      dualRight = false;
      continue;
    }
    const raw = clean[i]!;
    const s = raw.trim();
    const trimmedEnd = raw.trimEnd();

    if (inGroup) {
      if (/^\(.*\)$/.test(s)) {
        push({ type: 'parenthetical', lines: [i], parts: [s] });
        cur = null;
      } else if (cur && cur.type === 'dialogue') {
        cur.lines.push(i);
        cur.parts.push(trimmedEnd.trimStart());
      } else {
        cur = push({ type: 'dialogue', lines: [i], parts: [s] });
      }
      prevBlank = false;
      continue;
    }

    if (!prevBlank) {
      if (cur) {
        cur.lines.push(i);
        cur.parts.push(stripLine(cur, trimmedEnd));
      } else {
        cur = push({ type: 'action', lines: [i], parts: [trimmedEnd] });
      }
      continue;
    }

    // Start of a block.
    prevBlank = false;
    const after = nextReal(i);
    const followedByContent = after < n && !isBlank(after);
    const single = (d: Draft) => {
      push(d);
      cur = null;
    };

    if (/^={3,}$/.test(s)) {
      single({ type: 'page-break', lines: [i], parts: [''] });
    } else if (s.startsWith('#')) {
      const level = /^#+/.exec(s)![0].length;
      single({ type: 'section', lines: [i], parts: [s.slice(level).trim()], level });
    } else if (/^=(?!=)/.test(s)) {
      single({ type: 'synopsis', lines: [i], parts: [s.slice(1).trim()] });
    } else if (s.startsWith('!')) {
      cur = push({
        type: 'action',
        lines: [i],
        parts: [trimmedEnd.trimStart().slice(1)],
        forced: true,
      });
    } else if (s.startsWith('.') && !s.startsWith('..') && s.length > 1) {
      single({ type: 'scene-heading', lines: [i], parts: [s.slice(1).trim()], forced: true });
    } else if (s.length >= 2 && s.startsWith('>') && s.endsWith('<')) {
      cur = push({ type: 'centered', lines: [i], parts: [s.slice(1, -1).trim()] });
    } else if (s.startsWith('>') && s.length > 1) {
      single({ type: 'transition', lines: [i], parts: [s.slice(1).trim()], forced: true });
    } else if (s.startsWith('~')) {
      cur = push({ type: 'lyric', lines: [i], parts: [s.slice(1).trim()] });
    } else if (s.startsWith('@') && s.length > 1) {
      startCharacter(i, s.slice(1).trim(), true);
    } else if (SCENE_PREFIX.test(s)) {
      single({ type: 'scene-heading', lines: [i], parts: [s] });
    } else if (s === s.toUpperCase() && s.endsWith('TO:') && !followedByContent) {
      single({ type: 'transition', lines: [i], parts: [s] });
    } else if (followedByContent && isValidCue(parseCue(s).name)) {
      startCharacter(i, s, false);
    } else {
      cur = push({ type: 'action', lines: [i], parts: [trimmedEnd] });
    }
  }

  // --- finalise drafts into elements ---
  const elements: ScriptElement[] = [];
  let sp = 0;
  for (const d of drafts) {
    const first = lines[d.lines[0]!]!;
    const last = lines[d.lines[d.lines.length - 1]!]!;
    const from = first.start;
    const to = last.end;
    for (const i of d.lines) lineClasses[i] = d.type;
    const el: ScriptElement = {
      type: d.type,
      text: '',
      raw: text.slice(from, to),
      from,
      to,
      startLine: d.lines[0]!,
      endLine: d.lines[d.lines.length - 1]!,
    };
    if (d.type === 'note' || d.type === 'boneyard') {
      el.text = spanText(text, spans, lineSpan[d.lines[0]!]!, from, to);
      elements.push(el);
      continue;
    }
    let t = d.parts.join('\n');
    if (d.type === 'scene-heading') {
      const m = SCENE_NUMBER.exec(t);
      if (m) {
        el.sceneNumber = m[1]!.trim();
        t = t.slice(0, m.index);
      }
    }
    if (EMPHASIS_TYPES.has(d.type)) {
      // Emphasis never carries across a line break.
      const styles: StyleSpan[] = [];
      let off = 0;
      t = t
        .split('\n')
        .map((part) => {
          const e = extractEmphasis(part);
          for (const st of e.styles) styles.push({ ...st, from: st.from + off, to: st.to + off });
          off += e.text.length + 1;
          return e.text;
        })
        .join('\n');
      if (styles.length) el.styles = styles;
    }
    el.text = t;
    if (d.forced) el.forced = true;
    if (d.dual) el.dual = d.dual;
    if (d.level !== undefined) el.level = d.level;
    if (d.extension !== undefined) el.extension = d.extension;
    while (sp < spans.length && spans[sp]!.to <= from) sp++;
    for (let k = sp; k < spans.length && spans[k]!.from < to; k++) {
      (el.notes ??= []).push(spans[k]!);
    }
    elements.push(el);
  }

  return {
    doc: { titlePage: title ? title.entries : [], elements },
    lines: lineClasses,
  };
}

/** Removes the per-line marker that continuation lines of lyrics and centred text may carry. */
function stripLine(d: Draft, line: string): string {
  const t = line.trim();
  if (d.type === 'lyric') return t.startsWith('~') ? t.slice(1).trim() : t;
  if (d.type === 'centered') {
    return t.startsWith('>') && t.endsWith('<') && t.length >= 2 ? t.slice(1, -1).trim() : t;
  }
  return line;
}

/** Inner content of a note/boneyard span, restricted to the lines `[from, to)` an element covers. */
function spanText(
  text: string,
  spans: SourceSpan[],
  idx: number,
  from: number,
  to: number,
): string {
  const sp = spans[idx]!;
  const a = Math.max(sp.from, from);
  const b = Math.min(sp.to, to);
  let t = text.slice(a, b);
  const closer = sp.kind === 'note' ? ']]' : '*/';
  const closed = b === sp.to && t.length - (a === sp.from ? 2 : 0) >= 2 && t.endsWith(closer);
  if (a === sp.from) t = t.slice(2);
  if (closed) t = t.slice(0, -2);
  return t.replace(/\r\n/g, '\n').trim();
}

/** Parses Fountain text into a title page and a flat list of elements with source positions. */
export function parse(text: string): ScriptDocument {
  return analyze(text).doc;
}

/** One entry per source line (split on `\n` / `\r\n`), using the same logic as `parse`. */
export function classifyLines(text: string): LineClass[] {
  return analyze(text).lines;
}
