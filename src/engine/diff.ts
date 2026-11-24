/** Line-level diff and the collapsed view model for comparing drafts (ticket 11). Pure. */

export interface Hunk {
  kind: 'equal' | 'add' | 'remove';
  lines: string[];
}

/** Line diff of `a` (old) against `b` (new): LCS after trimming the common prefix and suffix. */
export function diff(a: string, b: string): Hunk[] {
  return diffLines(a === '' ? [] : a.split('\n'), b === '' ? [] : b.split('\n'));
}

function diffLines(x: string[], y: string[]): Hunk[] {
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const mid = lcsDiff(x.slice(start, endX), y.slice(start, endY));
  const hunks: Hunk[] = [];
  const push = (kind: Hunk['kind'], lines: string[]) => {
    if (lines.length === 0) return;
    const last = hunks[hunks.length - 1];
    if (last && last.kind === kind) last.lines.push(...lines);
    else hunks.push({ kind, lines: [...lines] });
  };
  push('equal', x.slice(0, start));
  for (const h of mid) push(h.kind, h.lines);
  push('equal', x.slice(endX));
  return hunks;
}

/**
 * Above this many table cells (~16 MB), the changed middle is first split at lines that occur exactly
 * once on each side; a part with no such line is reported as one remove + one add.
 */
const MAX_LCS_CELLS = 4_000_000;

function lcsDiff(x: string[], y: string[]): Hunk[] {
  const n = x.length;
  const m = y.length;
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
    const anchors = uniqueAnchors(x, y);
    if (anchors.length > 0) return diffBetween(x, y, anchors);
    return [
      ...(n ? [{ kind: 'remove' as const, lines: x }] : []),
      ...(m ? [{ kind: 'add' as const, lines: y }] : []),
    ];
  }
  // len[i][j] = LCS length of x[i..] and y[j..]
  const len: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i]![j] =
        x[i] === y[j] ? len[i + 1]![j + 1]! + 1 : Math.max(len[i + 1]![j]!, len[i]![j + 1]!);
    }
  }
  const out: Hunk[] = [];
  const push = (kind: Hunk['kind'], line: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      push('equal', x[i]!);
      i++;
      j++;
    } else if (i < n && (j >= m || len[i + 1]![j]! >= len[i]![j + 1]!)) {
      push('remove', x[i++]!);
    } else {
      push('add', y[j++]!);
    }
  }
  return out;
}

/** Index pairs of lines unique in both `x` and `y`, the longest run that is in order in both. */
function uniqueAnchors(x: string[], y: string[]): [number, number][] {
  const index = (lines: string[]) => {
    const seen = new Map<string, number>(); // line -> its index, or -1 once repeated
    lines.forEach((line, i) => seen.set(line, seen.has(line) ? -1 : i));
    return seen;
  };
  const inY = index(y);
  const pairs: [number, number][] = [];
  for (const [line, i] of index(x)) {
    const j = inY.get(line) ?? -1;
    if (i >= 0 && j >= 0) pairs.push([i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  // Longest increasing subsequence of the `y` indexes (patience sorting).
  const tails: number[] = []; // tails[k] = the pair ending the best run of length k + 1
  const previous: number[] = [];
  pairs.forEach(([, j], p) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]!]![1] < j) lo = mid + 1;
      else hi = mid;
    }
    previous[p] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = p;
  });
  const out: [number, number][] = [];
  for (let p = tails.at(-1) ?? -1; p >= 0; p = previous[p]!) out.push(pairs[p]!);
  return out.reverse();
}

/** Diffs each stretch between the anchored (equal) lines on its own. */
function diffBetween(x: string[], y: string[], anchors: [number, number][]): Hunk[] {
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  for (const [a, b] of anchors) {
    out.push(...diffLines(x.slice(i, a), y.slice(j, b)), { kind: 'equal', lines: [x[a]!] });
    i = a + 1;
    j = b + 1;
  }
  out.push(...diffLines(x.slice(i), y.slice(j)));
  return out;
}

/** Added / removed line counts of a diff (for "+42 −17"). */
export function diffStats(hunks: Hunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    if (h.kind === 'add') added += h.lines.length;
    else if (h.kind === 'remove') removed += h.lines.length;
  }
  return { added, removed };
}

export type DiffRow =
  { kind: 'equal' | 'add' | 'remove'; text: string } | { kind: 'collapsed'; count: number };

/** Unchanged runs longer than this are collapsed to "… n unchanged lines …". */
export const COLLAPSE_OVER = 6;

/** Flat rows for display, with long unchanged runs collapsed. */
export function diffRows(hunks: Hunk[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const h of hunks) {
    if (h.kind === 'equal' && h.lines.length > COLLAPSE_OVER) {
      rows.push({ kind: 'collapsed', count: h.lines.length });
    } else {
      for (const text of h.lines) rows.push({ kind: h.kind, text });
    }
  }
  return rows;
}
