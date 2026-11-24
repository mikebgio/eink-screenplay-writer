/**
 * The sync conflict screen (ticket 12): both versions one page at a time, never scrolled, and the
 * writer's choice. Lines are wrapped here to the measured column width, so a page always fits.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { diff, diffRows, firstDifference, sideBySideRows, wrapLine } from '../engine';
import type { ConflictChoice, ResolveResult } from '../storage/session';
import { DiffPage, Pager, paginateRows } from './diffPage';
import { wrapDiffRows, wrapSideBySide } from './conflictPages';

/** Matches `.conflict-body` in styles.css. */
const LINE_PX = 20;
const GUTTER_CHARS = 2;
const PROBE_CHARS = 50;

type View = 'side' | 'changes';

/** One line ending, and no tabs: wrapping counts one column per character. */
const forDisplay = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');

export interface ConflictScreenProps {
  mine: string;
  theirs: string;
  onChoose: (choice: ConflictChoice) => Promise<ResolveResult>;
  onCancel: () => void;
}

export function ConflictScreen(p: ConflictScreenProps) {
  const [view, setView] = useState<View>('side');
  const [chosenPage, setPage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [size, setSize] = useState({ rows: 20, cols: 80 });
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const b = body.current;
      const width = (probe.current?.getBoundingClientRect().width ?? 0) / PROBE_CHARS;
      if (!b || !width || !b.clientHeight) return;
      // One line is the column headings.
      const rows = Math.max(Math.floor(b.clientHeight / LINE_PX) - 1, 3);
      const cols = Math.max(Math.floor(b.clientWidth / width), 24);
      setSize((s) => (s.rows === rows && s.cols === cols ? s : { rows, cols }));
    };
    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // The legend and the note change how tall the page is.
  }, [note, view]);

  useEffect(() => root.current?.focus(), []);
  const cancel = useRef(p.onCancel);
  cancel.current = p.onCancel;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!busyRef.current) cancel.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const mine = useMemo(() => forDisplay(p.mine), [p.mine]);
  const theirs = useMemo(() => forDisplay(p.theirs), [p.theirs]);
  // A newer other version starts again at its first difference.
  useEffect(() => setPage(null), [theirs]);

  const side = useMemo(() => {
    // Two columns, each with a change marker, and one character between them.
    const width = Math.floor((size.cols - 1) / 2) - GUTTER_CHARS;
    const rows = wrapSideBySide(sideBySideRows(mine, theirs), width, wrapLine);
    return {
      pages: paginateRows(rows, size.rows),
      start: Math.floor(firstDifference(rows) / size.rows),
    };
  }, [mine, theirs, size]);
  const changes = useMemo(
    () =>
      paginateRows(
        // Theirs is the starting point; mine are the changes.
        wrapDiffRows(diffRows(diff(theirs, mine)), size.cols - GUTTER_CHARS, wrapLine),
        size.rows,
      ),
    [mine, theirs, size],
  );

  const count = view === 'side' ? side.pages.length : changes.length;
  const page = Math.min(chosenPage ?? (view === 'side' ? side.start : 0), count - 1);

  const choose = (choice: ConflictChoice) => async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await p.onChoose(choice);
      if (r.kind === 'changed') {
        setNote('The other version just changed again. Check it, then choose.');
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={root}
      tabIndex={-1}
      class="conflict"
      role="dialog"
      aria-modal="true"
      aria-label="Sync conflict"
    >
      <h2>This script was changed somewhere else.</h2>
      <div class="var-menu" role="group" aria-label="View">
        {(
          [
            ['side', 'Side by side'],
            ['changes', 'Changes'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => {
              setView(id);
              setPage(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'changes' && <p>− only on the other device · + only on this device</p>}
      <div ref={body} class="conflict-body">
        <span ref={probe} class="conflict-probe" aria-hidden="true">
          {'0'.repeat(PROBE_CHARS)}
        </span>
        {view === 'changes' ? (
          <DiffPage rows={changes[page]!} />
        ) : (
          <div class="conflict-columns">
            <strong>This device</strong>
            <strong>Other device</strong>
            {side.pages[page]!.map((r, i) => (
              <>
                <div key={`l${i}`} class={r.changed ? 'conflict-changed' : undefined}>
                  {r.changed && r.left !== null ? '▌ ' : '  '}
                  {r.left}
                </div>
                <div key={`r${i}`} class={r.changed ? 'conflict-changed' : undefined}>
                  {r.changed && r.right !== null ? '▌ ' : '  '}
                  {r.right}
                </div>
              </>
            ))}
          </div>
        )}
      </div>
      <Pager page={page} count={count} onPage={setPage} />
      {note && (
        <p class="var-error" role="alert">
          {note}
        </p>
      )}
      <div class="var-menu conflict-choices">
        <button type="button" disabled={busy} onClick={choose('mine')}>
          Keep mine
        </button>
        <button type="button" disabled={busy} onClick={choose('theirs')}>
          Take theirs
        </button>
        <button type="button" disabled={busy} onClick={choose('both')}>
          Keep both
        </button>
        <button type="button" disabled={busy} onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
