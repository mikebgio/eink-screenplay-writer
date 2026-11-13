import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  displayPages,
  formatRunningTime,
  pageIndexForLine,
  paginate,
  parse,
  sourceLineOf,
  deleteVariable,
  renameVariable,
  resolve,
  setVariable,
  variableUses,
  type EditResult,
  type VariableUse,
} from '../engine';
import { createStorage, FilesystemJournal, onBackground, preferencesStore } from '../platform';
import type { FileRef } from '../storage/port';
import { RecentFiles } from '../storage/recent';
import { LAYOUT_KEY, LAYOUT_MODES, nextLayout, parseLayout, type LayoutMode } from './layout';
import { DocumentSession, type Recovery, type SaveStatus } from '../storage/session';
import { newScriptTemplate } from '../storage/template';
import { Editor, type EditorHandle } from './Editor';
import { VariableDrawer } from './VariableDrawer';
import { PrintView } from './PrintView';
import { StartScreen } from './StartScreen';

const DEBOUNCE_MS = 150;

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved',
};

export function App() {
  const storage = useMemo(createStorage, []);
  const recent = useMemo(() => new RecentFiles(preferencesStore), []);
  const [recents, setRecents] = useState<FileRef[]>([]);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const session = useMemo(
    () => new DocumentSession({ storage, journal: new FilesystemJournal(), onStatus: setStatus }),
    [storage],
  );

  const [current, setCurrent] = useState<FileRef | null>(null);
  const [text, setText] = useState('');
  const [revision, setRevision] = useState(0);
  const [debounced, setDebounced] = useState('');
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [workspace, setWorkspace] = useState<{ uri: string; files: FileRef[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editor = useRef<EditorHandle>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => void recent.list().then(setRecents), [recent]);
  useEffect(() => onBackground(() => void session.onBackground()), [session]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Ctrl+D toggles the variable drawer (captured before the editor's own Ctrl+D binding).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopPropagation();
        setDrawerOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const show = useCallback((t: string) => {
    clearTimeout(timer.current); // a pending preview update belongs to the old document
    setText(t);
    setDebounced(t);
    setRevision((r) => r + 1);
  }, []);

  const openRef = useCallback(
    async (ref: FileRef) => {
      setError(null);
      try {
        await session.save();
        const rec = await session.open(ref);
        setCurrent(ref);
        show(session.text);
        setRecovery(rec);
        setRecents(await recent.add(ref));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [session, recent, show],
  );

  const onChange = useCallback(
    (t: string) => {
      session.edit(t);
      // Typing replaces the journal, so the recovery offer no longer applies.
      setRecovery(null);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDebounced(t), DEBOUNCE_MS);
    },
    [session],
  );

  const guarded = (fn: () => Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const newScript = guarded(async () => {
    const ref = await storage.pickCreate('Untitled.fountain');
    if (!ref) return;
    await storage.write(ref, newScriptTemplate());
    await openRef(ref);
  });
  const openFile = guarded(async () => {
    const ref = await storage.pickOpen();
    if (ref) await openRef(ref);
  });
  const chooseFolder = guarded(async () => {
    const f = await storage.pickFolder();
    if (f) setWorkspace({ uri: f.uri, files: await storage.listFolder(f.uri) });
  });

  const doc = useMemo(() => parse(debounced), [debounced]);
  const resolved = useMemo(() => resolve(doc, { mode: 'resolve' }), [doc]);
  const paged = useMemo(() => paginate(resolved.doc), [resolved]);
  const uses = useMemo(() => variableUses(doc), [doc]);
  const undefinedKeys = useMemo(
    () => new Set(resolved.diagnostics.filter((d) => d.kind === 'undefined').map((d) => d.key)),
    [resolved],
  );
  const pages = useMemo(() => displayPages(paged), [paged]);

  // Layout mode: remembered in Preferences; default is side by side when the window is wide.
  const [layout, setLayout] = useState<LayoutMode>(() =>
    window.innerWidth > 1000 ? 'both' : 'editor',
  );
  useEffect(() => {
    void preferencesStore.get(LAYOUT_KEY).then((v) => {
      const saved = parseLayout(v);
      if (saved) setLayout(saved);
    });
  }, []);
  const chooseLayout = useCallback((m: LayoutMode) => {
    setLayout(m);
    void preferencesStore.set(LAYOUT_KEY, m);
  }, []);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        chooseLayout(nextLayout(layoutRef.current));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chooseLayout]);

  // The print view shows one page; the editor cursor drags it along when it crosses a page boundary.
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const [jump, setJump] = useState<{ line: number; seq: number }>({ line: 0, seq: 0 });
  const cursorPage = useMemo(
    () => pageIndexForLine(doc, paged, cursorLine),
    [doc, paged, cursorLine],
  );
  // Set when a tapped line belongs to an element that starts on an earlier page: the cursor goes to
  // the element's first line, but the print view stays on the page that was tapped.
  const keepPage = useRef<number | null>(null);
  useEffect(() => {
    const keep = keepPage.current === cursorPage;
    keepPage.current = null;
    if (!keep) setPageIndex(cursorPage);
  }, [cursorPage]);
  // A newly opened document starts with the cursor (and the print view) at its top.
  useEffect(() => {
    keepPage.current = null;
    setCursorLine(0);
    setPageIndex(0);
  }, [revision]);
  const shownPage = Math.min(pageIndex, pages.length - 1);

  // Switching to Print only hides the editor, which drops focus; give it to the print view so
  // PgUp / PgDn / Space work straight away.
  const printPane = useRef<HTMLElement>(null);
  useEffect(() => {
    if (layout === 'print') printPane.current?.querySelector<HTMLElement>('.print-view')?.focus();
  }, [layout, current]);

  /** Display page number of an element's first printed line (for "Show uses"). */
  const pageOf = useCallback(
    (elementIndex: number) =>
      pages.find((p) => p.lines.some((l) => l.elementIndex === elementIndex))?.number,
    [pages],
  );
  /** Runs a text transform against the editor's current text; returns an error message, if any. */
  const edit = (make: (text: string) => EditResult): string | null => {
    const h = editor.current;
    if (!h) return null;
    const r = make(h.getText());
    if ('error' in r) return r.error;
    h.apply(r.changes);
    return null;
  };
  const jumpToUse = (u: VariableUse) => {
    const h = editor.current;
    if (!h) return;
    if (layoutRef.current === 'print') setLayout('both');
    h.reveal(u.from, u.to);
    const line = h.getText().slice(0, u.from).split('\n').length - 1;
    setCursorLine(line);
    setPageIndex(pageIndexForLine(doc, paged, line));
  };

  if (!current) {
    return (
      <StartScreen
        recents={recents}
        workspaceFiles={workspace?.files ?? null}
        error={error}
        onNew={() => void newScript()}
        onOpen={() => void openFile()}
        onFolder={() => void chooseFolder()}
        onPick={(r) => void openRef(r)}
      />
    );
  }

  return (
    <div class="app-shell">
      <header class="doc-bar">
        <button
          type="button"
          onClick={() => {
            void session.save().then(() => setCurrent(null));
          }}
        >
          Files
        </button>
        <span class="doc-name">{current.name}</span>
        <button type="button" aria-pressed={drawerOpen} onClick={() => setDrawerOpen((o) => !o)}>
          Variables
        </button>
        <span class="save-status">{STATUS_LABEL[status]}</span>
        <span class="save-status">
          {paged.pageCount} pp · {formatRunningTime(paged.estimatedMinutes)}
        </span>
        <span class="layout-toggle" role="group" aria-label="Layout (Ctrl+P)">
          {LAYOUT_MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layout === mode}
              onClick={() => chooseLayout(mode)}
            >
              {label}
            </button>
          ))}
        </span>
      </header>
      {recovery && (
        <div class="recovery">
          Recover unsaved changes from {new Date(recovery.savedAt).toLocaleString()}?
          <button
            type="button"
            onClick={() => {
              session.recover(recovery);
              show(recovery.text);
              setRecovery(null);
            }}
          >
            Recover
          </button>
          <button
            type="button"
            onClick={() => {
              void session.discard();
              setRecovery(null);
            }}
          >
            Discard
          </button>
        </div>
      )}
      <div class="app">
        <section class={`pane pane-editor${layout === 'print' ? ' pane-hidden' : ''}`}>
          <Editor
            text={text}
            revision={revision}
            onChange={onChange}
            onCursorLine={setCursorLine}
            jump={jump}
            onReady={(h) => (editor.current = h)}
          />
        </section>
        <section
          ref={printPane}
          class={`pane pane-print${layout === 'editor' ? ' pane-hidden' : ''}`}
        >
          <PrintView
            paged={paged}
            pages={pages}
            pageIndex={shownPage}
            undefinedKeys={undefinedKeys}
            onPage={setPageIndex}
            onLine={(el) => {
              const line = sourceLineOf(doc, el);
              if (line === undefined) return;
              const target = pageIndexForLine(doc, paged, line);
              if (target !== cursorPage && target !== shownPage) keepPage.current = target;
              setCursorLine(line);
              setJump((j) => ({ line, seq: j.seq + 1 }));
              // Show the editor for this jump without overwriting the saved layout choice.
              if (layoutRef.current === 'print') setLayout('editor');
            }}
          />
        </section>
        {drawerOpen && (
          <VariableDrawer
            variables={resolved.variables}
            diagnostics={resolved.diagnostics}
            uses={uses}
            pageOf={pageOf}
            onSetValue={(k, v) => edit((t) => setVariable(t, k, v))}
            onRename={(k, to) => edit((t) => renameVariable(t, k, to))}
            onDelete={(k, mode) => void edit((t) => deleteVariable(t, k, mode))}
            onJump={jumpToUse}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
