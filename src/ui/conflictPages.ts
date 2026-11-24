/** Turns comparison rows into screen lines for the conflict screen. Pure. */
import type { DiffRow, SideBySideRow } from '../engine';
import type { DiffPageRow } from './diffPage';

type Wrap = (text: string, width: number) => string[];

export function wrapDiffRows(rows: DiffRow[], width: number, wrap: Wrap): DiffPageRow[] {
  return rows.flatMap((r): DiffPageRow[] =>
    r.kind === 'collapsed'
      ? [r]
      : wrap(r.text, width).map((text, i) => ({
          kind: r.kind,
          text,
          ...(i > 0 ? { continued: true } : {}),
        })),
  );
}

/** Both sides of a row wrap to the same number of lines, so the columns stay in step. */
export function wrapSideBySide(rows: SideBySideRow[], width: number, wrap: Wrap): SideBySideRow[] {
  return rows.flatMap((r) => {
    const left = r.left === null ? [] : wrap(r.left, width);
    const right = r.right === null ? [] : wrap(r.right, width);
    return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => ({
      left: left[i] ?? null,
      right: right[i] ?? null,
      changed: r.changed,
    }));
  });
}
