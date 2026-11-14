import { classifyLines } from './parse';
import type { LineClass } from './types';

/**
 * Keyboard-first editing as pure functions: (text, cursor) → (new text, new cursor).
 * The document is plain Fountain, so "changing the element type" is a text edit.
 */

/** A line the writer has asked to be a cue or transition before anything is typed on it. */
export type Mode = 'character' | 'transition' | null;

export interface EditState {
  text: string;
  /** Offset of the (collapsed) cursor. */
  cursor: number;
  /** Capitalising mode of the cursor line; `null`/absent when there is none. */
  mode?: Mode;
}

export type ForceKind =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'lyric';

interface Bounds {
  from: number;
  to: number;
  index: number;
}

function boundsOf(text: string, cursor: number): Bounds {
  const from = text.lastIndexOf('\n', cursor - 1) + 1;
  const nl = text.indexOf('\n', cursor);
  const index = text.slice(0, from).split('\n').length - 1;
  return { from, to: nl < 0 ? text.length : nl, index };
}

function replaceLine(s: EditState, b: Bounds, line: string, cursor: number, mode: Mode): EditState {
  return { text: s.text.slice(0, b.from) + line + s.text.slice(b.to), cursor: b.from + cursor, mode };
}

/** How Fountain reads `line` when it sits alone between blank lines, optionally followed by dialogue. */
function readAs(line: string, followedBy: 'blank' | 'text'): LineClass | undefined {
  const text = followedBy === 'text' ? `x\n\n${line}\nx` : `x\n\n${line}\n\nx`;
  return classifyLines(text)[2];
}

const NEWLINE = (s: EditState, extra: string): EditState => ({
  text: s.text.slice(0, s.cursor) + extra + s.text.slice(s.cursor),
  cursor: s.cursor + extra.length,
  mode: null,
});

/** The elements whose Enter leaves a blank line before the next one. */
const BLANK_AFTER = new Set<LineClass>([
  'scene-heading',
  'action',
  'dialogue',
  'transition',
  'centered',
  'section',
  'synopsis',
  'page-break',
]);

/** Finishes a line that is in character or transition mode: capitalise it and add a forcing mark if needed. */
function finishModeLine(line: string, mode: 'character' | 'transition'): string {
  const up = line.toUpperCase();
  if (mode === 'character') {
    if (up.startsWith('@')) return up;
    return readAs(up, 'text') === 'character' ? up : `@${up}`;
  }
  if (up.startsWith('>')) return up;
  return readAs(up, 'blank') === 'transition' ? up : `>${up}`;
}

/** Enter with a collapsed cursor. Always produces a result; mid-line it just splits the line. */
export function enter(s: EditState): EditState {
  const b = boundsOf(s.text, s.cursor);
  const line = s.text.slice(b.from, b.to);
  // Just before the closing ")" of a parenthetical counts as the end of the line.
  if (s.cursor === b.to - 1 && /^\(.*\)$/.test(line)) return enter({ ...s, cursor: b.to });
  const atEnd = s.cursor === b.to;
  const mode = s.mode ?? null;
  if (mode && atEnd && line.trim() !== '') {
    const done = finishModeLine(line, mode);
    const out = replaceLine(s, b, done, done.length, null);
    return NEWLINE(out, mode === 'character' ? '\n' : '\n\n');
  }
  if (!atEnd || line.trim() === '') return NEWLINE(s, '\n');
  const kind = classifyLines(s.text)[b.index];
  if (kind === 'character' || kind === 'parenthetical') return NEWLINE(s, '\n');
  if (kind && BLANK_AFTER.has(kind)) return NEWLINE(s, '\n\n');
  return NEWLINE(s, '\n');
}

const MODES: Mode[] = [null, 'character', 'transition'];

/**
 * Tab (or Shift+Tab with `shift`). Returns `null` when Tab has no meaning here, which the editor
 * swallows rather than moving focus away.
 */
export function tab(s: EditState, shift = false): EditState | null {
  const b = boundsOf(s.text, s.cursor);
  const line = s.text.slice(b.from, b.to);
  // An empty "()": back to dialogue.
  if (line === '()' && s.cursor === b.from + 1) return replaceLine(s, b, '', 0, null);
  if (line !== '') return null;
  const mode = s.mode ?? null;
  const prev = b.index > 0 ? s.text.slice(0, b.from - 1).split('\n').pop()! : '';
  if (mode || b.index === 0 || prev.trim() === '') {
    const i = MODES.indexOf(mode);
    return { ...s, mode: MODES[(i + (shift ? 2 : 1)) % MODES.length]! };
  }
  if (shift) return null;
  // Directly under a cue or dialogue: a parenthetical.
  const withPlaceholder = s.text.slice(0, b.from) + 'x' + s.text.slice(b.to);
  const above = classifyLines(withPlaceholder)[b.index - 1];
  if (above === 'character' || above === 'dialogue') return replaceLine(s, b, '()', 1, null);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Forcing an element type
// ---------------------------------------------------------------------------------------------

interface Unforced {
  /** The line without its forcing marks. */
  content: string;
  /** Offset of `content` in the original line. */
  start: number;
  /** The type the marks forced, if there were any. */
  forced: ForceKind | null;
}

function unforce(line: string): Unforced {
  let m = /^>\s*(.*?)\s*<$/.exec(line);
  if (m) return { content: m[1]!, start: line.indexOf(m[1]!, 1), forced: 'centered' };
  m = /^>\s?(.*)$/.exec(line);
  if (m) return { content: m[1]!, start: line.length - m[1]!.length, forced: 'transition' };
  m = /^\.(?!\.)(.*)$/.exec(line);
  if (m) return { content: m[1]!, start: 1, forced: 'scene-heading' };
  m = /^!(.*)$/.exec(line);
  if (m) return { content: m[1]!, start: 1, forced: 'action' };
  m = /^@(.*)$/.exec(line);
  if (m) return { content: m[1]!, start: 1, forced: 'character' };
  m = /^~\s?(.*)$/.exec(line);
  if (m) return { content: m[1]!, start: line.length - m[1]!.length, forced: 'lyric' };
  m = /^\((.*)\)$/.exec(line);
  if (m) return { content: m[1]!, start: 1, forced: 'parenthetical' };
  return { content: line, start: 0, forced: null };
}

/** The line for `kind` built from bare `content`, and where the content starts in it. */
function build(kind: ForceKind, content: string): { line: string; start: number } {
  switch (kind) {
    case 'scene-heading': {
      const up = content.toUpperCase();
      return readAs(up, 'blank') === 'scene-heading' ? { line: up, start: 0 } : { line: `.${up}`, start: 1 };
    }
    case 'action':
      return readAs(content, 'blank') === 'action' ? { line: content, start: 0 } : { line: `!${content}`, start: 1 };
    case 'character': {
      const up = content.toUpperCase();
      return readAs(up, 'text') === 'character' ? { line: up, start: 0 } : { line: `@${up}`, start: 1 };
    }
    case 'parenthetical':
      return { line: `(${content})`, start: 1 };
    case 'dialogue':
      return { line: content, start: 0 };
    case 'transition': {
      const up = content.toUpperCase();
      return readAs(up, 'blank') === 'transition' ? { line: up, start: 0 } : { line: `>${up}`, start: 1 };
    }
    case 'centered':
      return { line: `> ${content} <`, start: 2 };
    case 'lyric':
      return { line: `~${content}`, start: 1 };
  }
}

/**
 * Rewrites the cursor line as `kind` (Ctrl+1 … Ctrl+8). Forcing marks are added only when Fountain
 * wouldn't read the line that way anyway; repeating the shortcut on a forced line removes the marks.
 * On an empty line, cue and transition start their capitalising mode instead.
 */
export function force(s: EditState, kind: ForceKind): EditState {
  const b = boundsOf(s.text, s.cursor);
  const line = s.text.slice(b.from, b.to);
  if (line === '') {
    switch (kind) {
      case 'character':
      case 'transition':
        return { ...s, mode: kind };
      case 'parenthetical':
        return replaceLine(s, b, '()', 1, null);
      case 'centered':
        return replaceLine(s, b, '>  <', 2, null);
      case 'lyric':
        return replaceLine(s, b, '~', 1, null);
      default:
        return { ...s, mode: null };
    }
  }
  const { content, start, forced } = unforce(line);
  const col = Math.min(Math.max(s.cursor - b.from - start, 0), content.length);
  if (forced === kind) return replaceLine(s, b, content, col, null);
  const built = build(kind, content);
  return replaceLine(s, b, built.line, built.start + col, null);
}

// ---------------------------------------------------------------------------------------------
// Capitalising as you type
// ---------------------------------------------------------------------------------------------

/** Scene-heading prefixes that capitalise the whole line when typed. */
export const HEADING_PREFIX = /^(?:int\.\/ext\.|int\.|ext\.|est\.|i\/e[.\s])/i;

export interface InputChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * After the writer types `change` into `before`, returns the same-length replacement that capitalises
 * what should be capitalised (offsets refer to the text *after* the change), or `null`. Only single-line
 * insertions are considered, and callers must not pass pasted text.
 *
 * - in character/transition mode: the typed text
 * - the moment a line starts with INT. / EXT. / EST. / INT./EXT. / I/E: the whole line
 * - on a line that is already a scene heading, cue or transition: the typed text
 */
export function capitalizeInput(before: string, change: InputChange, mode: Mode = null): InputChange | null {
  if (change.insert === '' || change.insert.includes('\n')) return null;
  const after = before.slice(0, change.from) + change.insert + before.slice(change.to);
  const end = change.from + change.insert.length;
  const b = boundsOf(after, end);
  const lineAfter = after.slice(b.from, b.to);
  const lineBefore = boundsOf(before, change.from);
  const oldLine = before.slice(lineBefore.from, lineBefore.to);
  const typed = { from: change.from, to: end };

  let range: { from: number; to: number } | null = null;
  if (mode) {
    range = typed;
  } else if (HEADING_PREFIX.test(lineAfter)) {
    range = HEADING_PREFIX.test(oldLine) ? typed : { from: b.from, to: b.to };
  } else if (/^\.(?!\.)/.test(oldLine) && /^\.(?!\.)/.test(lineAfter)) {
    range = typed; // forced scene heading
  } else if (/^@/.test(oldLine) || (/^>/.test(oldLine) && !/<\s*$/.test(oldLine))) {
    range = typed; // forced cue or transition
  } else if (/[A-Z]/.test(oldLine) && oldLine === oldLine.toUpperCase()) {
    const kind = classifyLines(before)[lineBefore.index];
    if (kind === 'character' || kind === 'transition') range = typed;
  }
  if (!range) return null;
  const old = after.slice(range.from, range.to);
  const up = old.toUpperCase();
  if (up === old || up.length !== old.length) return null;
  return { from: range.from, to: range.to, insert: up };
}
