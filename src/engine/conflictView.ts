/** View models for comparing two versions of a conflicted script (ticket 12). Pure. */
import { diff, type Hunk } from './diff';

export interface SideBySideRow {
  /** Line on this device; null where only the other side has one. */
  left: string | null;
  right: string | null;
  changed: boolean;
}

/** Aligns two texts line by line, so both columns can be paged in step. */
export function sideBySideRows(left: string, right: string): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      rows.push({ left: removed[i] ?? null, right: added[i] ?? null, changed: true });
    }
    removed = [];
    added = [];
  };
  for (const h of diff(left, right)) {
    if (h.kind === 'remove') removed.push(...h.lines);
    else if (h.kind === 'add') added.push(...h.lines);
    else {
      flush();
      for (const line of h.lines) rows.push({ left: line, right: line, changed: false });
    }
  }
  flush();
  return rows;
}

/** Index of the first changed row (0 if there is none). */
export function firstDifference(rows: SideBySideRow[]): number {
  return Math.max(
    rows.findIndex((r) => r.changed),
    0,
  );
}

/** Word-wraps one line to `width` characters, so a page holds a known number of screen lines. */
export function wrapLine(text: string, width: number): string[] {
  const max = Math.max(1, Math.floor(width));
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const space = rest.lastIndexOf(' ', max);
    // Never break inside the leading indent; a word longer than the line is cut.
    if (space > 0 && rest.slice(0, space).trim() !== '') {
      out.push(rest.slice(0, space).trimEnd());
      rest = rest.slice(space + 1).trimStart();
    } else {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
  }
  if (rest !== '' || out.length === 0) out.push(rest);
  return out;
}

/** Where the 0-based `line` of a diff's old text ends up in its new text. */
export function mapLine(hunks: Hunk[], line: number): number {
  let before = 0;
  let after = 0;
  let target: number | undefined;
  for (const h of hunks) {
    const n = h.lines.length;
    if (h.kind === 'add') {
      after += n;
      continue;
    }
    if (target === undefined && line < before + n) {
      target = h.kind === 'equal' ? after + (line - before) : after;
    }
    before += n;
    if (h.kind === 'equal') after += n;
  }
  return Math.max(0, Math.min(target ?? after - 1, after - 1));
}

/** The single replacement that turns `a` into `b`, trimmed to what differs. */
export function textChange(a: string, b: string): { from: number; to: number; insert: string } {
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a[start] === b[start]) start++;
  let tail = 0;
  while (tail < max - start && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return { from: start, to: a.length - tail, insert: b.slice(start, b.length - tail) };
}
