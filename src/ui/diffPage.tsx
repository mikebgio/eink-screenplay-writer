/** One page of the draft comparison (ticket 11), shared with the conflict screen (ticket 12). */
import type { DiffRow } from '../engine';

/** `continued` marks the wrapped rest of a line: it gets no second `+` / `−` prefix. */
export type DiffPageRow = DiffRow & { continued?: boolean };

export function paginateRows<T>(rows: T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

export function DiffPage({ rows }: { rows: DiffPageRow[] }) {
  return (
    <div class="diff-page">
      {rows.map((r, i) =>
        r.kind === 'collapsed' ? (
          <div key={i} class="diff-row diff-collapsed">
            … {r.count} unchanged lines …
          </div>
        ) : (
          <div key={i} class={`diff-row diff-${r.kind}`}>
            {r.continued ? '  ' : r.kind === 'remove' ? '− ' : r.kind === 'add' ? '+ ' : '  '}
            {r.text}
          </div>
        ),
      )}
    </div>
  );
}

export function Pager({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  return (
    <div class="var-menu">
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <span>
        {page + 1} / {count}
      </span>
      <button type="button" disabled={page >= count - 1} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
