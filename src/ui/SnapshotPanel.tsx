import { useEffect, useRef, useState } from 'preact/hooks';
import { diff, diffRows, diffStats, type DiffRow } from '../engine';
import type { Snapshot, SnapshotEntry } from '../storage/snapshots';

/** Rows per comparison page: the view never scrolls. */
export const DIFF_ROWS_PER_PAGE = 24;

export function paginateRows(rows: DiffRow[], perPage = DIFF_ROWS_PER_PAGE): DiffRow[][] {
  const pages: DiffRow[][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

interface Item extends SnapshotEntry {
  added: number;
  removed: number;
}

export interface SnapshotPanelProps {
  entries: SnapshotEntry[];
  deviceOnly: boolean;
  /** Current editor text, read when the panel renders and when comparing. */
  getCurrent: () => string;
  readSnapshot: (s: Snapshot) => Promise<string>;
  onName: (label: string) => Promise<void>;
  onRestore: (s: SnapshotEntry) => Promise<void>;
  onDelete: (s: SnapshotEntry) => Promise<void>;
  onClose: () => void;
  focusName: boolean;
}

function when(t: number): string {
  return new Date(t).toLocaleString();
}

export function SnapshotPanel(p: SnapshotPanelProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [label, setLabel] = useState('');
  const [compare, setCompare] = useState<{ entry: SnapshotEntry; rows: DiffRow[] } | null>(null);
  const [page, setPage] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const cur = p.getCurrent();
      const out: Item[] = [];
      for (const e of p.entries) {
        const { added, removed } = diffStats(diff(await p.readSnapshot(e), cur));
        out.push({ ...e, added, removed });
      }
      if (live) setItems(out);
    })();
    return () => {
      live = false;
    };
  }, [p.entries]);
  useEffect(() => {
    if (p.focusName) nameInput.current?.focus();
  }, [p.focusName]);

  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  if (compare) {
    const pages = paginateRows(compare.rows);
    const shown = Math.min(page, pages.length - 1);
    return (
      <aside class="drawer snap-compare" aria-label="Compare">
        <div class="drawer-head">
          <h2>
            Compare: {compare.entry.label ?? compare.entry.kind}, {when(compare.entry.time)}
          </h2>
          <button type="button" onClick={() => setCompare(null)}>
            Back
          </button>
        </div>
        <p>− removed since then · + added since then</p>
        <div class="diff-page">
          {pages[shown]!.map((r, i) =>
            r.kind === 'collapsed' ? (
              <div key={i} class="diff-row diff-collapsed">
                … {r.count} unchanged lines …
              </div>
            ) : (
              <div key={i} class={`diff-row diff-${r.kind}`}>
                {r.kind === 'remove' ? '− ' : r.kind === 'add' ? '+ ' : '  '}
                {r.text}
              </div>
            ),
          )}
        </div>
        <div class="var-menu">
          <button type="button" disabled={shown === 0} onClick={() => setPage(shown - 1)}>
            Prev
          </button>
          <span>
            {shown + 1} / {pages.length}
          </span>
          <button
            type="button"
            disabled={shown >= pages.length - 1}
            onClick={() => setPage(shown + 1)}
          >
            Next
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside class="drawer" aria-label="Snapshots">
      <div class="drawer-head">
        <h2>Snapshots</h2>
        <button type="button" onClick={p.onClose}>
          Close
        </button>
      </div>
      {p.deviceOnly && <p>Snapshots for this file are stored on this device only.</p>}
      <form
        class="var-line"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await p.onName(label.trim());
            setLabel('');
          })();
        }}
      >
        <input
          ref={nameInput}
          type="text"
          aria-label="Snapshot name"
          placeholder="Name this version (Ctrl+Shift+S)"
          value={label}
          onInput={(e) => setLabel(e.currentTarget.value)}
        />
        <button type="submit">Save</button>
      </form>
      {note && <p class="var-error">{note}</p>}
      {items.length === 0 && <p>No snapshots yet.</p>}
      {items.map((s) => (
        <div class="var-row" key={s.name}>
          <div>
            <strong>{when(s.time)}</strong> · {s.kind}
            {s.label ? ` · ${s.label}` : ''}
          </div>
          <div>
            vs. current: +{s.added} −{s.removed}
          </div>
          <div class="var-menu">
            <button
              type="button"
              onClick={run(async () => {
                setCompare({
                  entry: s,
                  rows: diffRows(diff(await p.readSnapshot(s), p.getCurrent())),
                });
                setPage(0);
              })}
            >
              Compare
            </button>
            <button type="button" onClick={run(() => p.onRestore(s))}>
              Restore
            </button>
            {s.kind === 'named' && (
              <button
                type="button"
                onClick={run(async () => {
                  if (window.confirm(`Delete snapshot "${s.label ?? s.slug ?? s.name}"?`))
                    await p.onDelete(s);
                })}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </aside>
  );
}
