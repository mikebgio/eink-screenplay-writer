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

/** How many of the newest snapshots get a "+n −m" summary. */
const STATS_FOR = 10;

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
  /** Bumped on each Ctrl+Shift+S; 0 = never asked. */
  focusSeq: number;
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
  const focusedSeq = useRef(0);

  // Line-count stats are only computed for the newest few snapshots (each costs a read and a diff).
  useEffect(() => {
    let live = true;
    const cur = p.getCurrent();
    setItems(p.entries.map((e) => ({ ...e, added: -1, removed: -1 })));
    void (async () => {
      for (const [i, e] of p.entries.slice(0, STATS_FOR).entries()) {
        try {
          const { added, removed } = diffStats(diff(await p.readSnapshot(e), cur));
          if (live) setItems((xs) => xs.map((x, k) => (k === i ? { ...x, added, removed } : x)));
        } catch {
          /* unreadable snapshot (e.g. removed by sync): leave its stats blank */
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [p.entries]);
  // Ctrl+Shift+S: leave Compare if needed, then focus the name field (once per press).
  useEffect(() => {
    if (p.focusSeq !== focusedSeq.current) setCompare(null);
  }, [p.focusSeq]);
  useEffect(() => {
    if (p.focusSeq !== focusedSeq.current && !compare) {
      focusedSeq.current = p.focusSeq;
      nameInput.current?.focus();
    }
  }, [p.focusSeq, compare]);

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
          {s.added >= 0 && (
            <div>
              vs. current: +{s.added} −{s.removed}
            </div>
          )}
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
