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
  diffTitleValues,
  titlePageChanges,
  titleValues,
  type EditResult,
  type VariableUse,
} from '../engine';
import {
  createStorage,
  FilesystemJournal,
  onBackground,
  preferencesStore,
  privateSnapshotStore,
} from '../platform';
import type { FileRef } from '../storage/port';
import { RecentFiles } from '../storage/recent';
import { LAYOUT_KEY, LAYOUT_MODES, nextLayout, parseLayout, type LayoutMode } from './layout';
import { DocumentSession, type Recovery, type SaveStatus } from '../storage/session';
import { newScriptTemplate } from '../storage/template';
import { Editor, type EditorHandle } from './Editor';
import { SnapshotService, type SnapshotEntry } from '../storage/snapshots';
import { SnapshotPanel } from './SnapshotPanel';
import { VariableDrawer } from './VariableDrawer';
import { PrintView } from './PrintView';
import { TitlePageForm } from './TitlePageForm';
import { PERSONAL_DICTIONARY_KEY, WordList, ignoreKey } from '../spell/wordList';
import { StartScreen } from './StartScreen';
import { commands, registerCommand } from './commands';
import { ShortcutHelp } from './ShortcutHelp';

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

  const snapshots = useMemo(
    () => new SnapshotService({ storage, privateStore: privateSnapshotStore }),
    [storage],
  );
  const [snapOpen, setSnapOpen] = useState(false);
  const [focusSeq, setFocusSeq] = useState(0);
  const [snapEntries, setSnapEntries] = useState<SnapshotEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const refreshSnaps = useCallback(
    () => void snapshots.entries().then(setSnapEntries, () => setSnapEntries([])),
    [snapshots],
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
  const hasDoc = useRef(false);
  hasDoc.current = current !== null;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [titleForm, setTitleForm] = useState<ReturnType<typeof titleValues> | null>(null);

  // Spell-check word lists: the writer's dictionary, and words ignored in this script only.
  const personal = useMemo(() => new WordList(preferencesStore, PERSONAL_DICTIONARY_KEY), []);
  const ignored = useRef<WordList>(undefined);
  const [spellVersion, setSpellVersion] = useState(0);
  useEffect(() => {
    void personal.load().then(() => setSpellVersion((v) => v + 1));
  }, [personal]);
  useEffect(() => {
    if (!current) return;
    const list = new WordList(preferencesStore, ignoreKey(current.uri));
    ignored.current = list;
    void list.load().then(() => setSpellVersion((v) => v + 1));
  }, [current]);
  const spellHooks = useMemo(
    () => ({
      personal: () => personal.list(),
      ignored: () => ignored.current?.list() ?? [],
      addToDictionary: (w: string) => void personal.add(w),
      ignoreInScript: (w: string) => void ignored.current?.add(w),
    }),
    [personal],
  );
  const openTitleForm = useCallback(() => {
    const h = editor.current;
    if (h) setTitleForm(titleValues(h.getText()));
  }, []);

  useEffect(() => void recent.list().then(setRecents), [recent]);
  useEffect(() => onBackground(() => void session.onBackground()), [session]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => () => snapshots.detach(), [snapshots]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  // Shortcuts: every command is registered centrally (see commands.ts); the handlers read the latest
  // state through `actions`, so the registrations below happen once.
  const [helpOpen, setHelpOpen] = useState(false);
  const actions = useRef<{
    save(): void;
    drawer(): void;
    snapshot(): void;
    titlePage(): void;
    layout(): void;
    help(): void;
    find(replace: boolean): void;
  }>(undefined as never);
  actions.current = {
    save: () => void session.save().catch((e) => setError(e instanceof Error ? e.message : String(e))),
    drawer: () => setDrawerOpen((o) => !o),
    snapshot: () => {
      setSnapOpen(true);
      setFocusSeq((n) => n + 1);
      refreshSnaps();
    },
    titlePage: openTitleForm,
    layout: () => chooseLayoutRef.current(nextLayout(layoutRef.current)),
    help: () => setHelpOpen((o) => !o),
    find: (replace) => void editor.current?.openFind(replace),
  };
  useEffect(() => {
    const doc = { enabled: () => hasDoc.current };
    const offs = [
      registerCommand({ id: 'file.save', label: 'Save now', keys: 'Ctrl+S', ...doc, run: () => actions.current.save() }),
      registerCommand({ id: 'drawer.toggle', label: 'Variable drawer', keys: 'Ctrl+D', ...doc, inInputs: false, run: () => actions.current.drawer() }),
      registerCommand({ id: 'layout.next', label: 'Change layout (editor / print / both)', keys: 'Ctrl+P', run: () => actions.current.layout() }),
      registerCommand({ id: 'help.shortcuts', label: 'Shortcut help', keys: 'Ctrl+/', run: () => actions.current.help() }),
      registerCommand({ id: 'snapshot.name', label: 'Name a snapshot', keys: 'Ctrl+Shift+S', ...doc, run: () => actions.current.snapshot() }),
      registerCommand({ id: 'title.form', label: 'Title page', keys: 'Ctrl+T', ...doc, run: () => actions.current.titlePage() }),
      registerCommand({ id: 'find.open', label: 'Find', keys: 'Ctrl+F', ...doc, inInputs: false, run: () => actions.current.find(false) }),
      registerCommand({ id: 'find.replace', label: 'Find and replace', keys: 'Ctrl+H', ...doc, inInputs: false, run: () => actions.current.find(true) }),
    ];
    const onKey = (e: KeyboardEvent) => void commands.handleEvent(e);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      offs.forEach((off) => off());
    };
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
        snapshots.detach();
        setToast(null);
        void snapshots.attach(ref, session.text, () => session.text).then(refreshSnaps, () => {});
        setRecovery(rec);
        setRecents(await recent.add(ref));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [session, recent, show, snapshots, refreshSnaps],
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
  const chooseLayoutRef = useRef(chooseLayout);
  chooseLayoutRef.current = chooseLayout;

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
      elementIndex < 0
        ? 0 // a title-page value
        : pages.find((p) => p.lines.some((l) => l.elementIndex === elementIndex))?.number,
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
    // `uses` comes from the debounced text; find the same use in the editor's live text.
    const nth = uses.filter((x) => x.key === u.key).indexOf(u);
    const live = variableUses(parse(h.getText())).filter((x) => x.key === u.key)[nth];
    if (!live) return;
    h.reveal(live.from, live.to);
    const line = h.getText().slice(0, live.from).split('\n').length - 1;
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
            void session.save().then(() => {
              snapshots.detach();
              setToast(null);
              setSnapOpen(false);
              setCurrent(null);
            });
          }}
        >
          Files
        </button>
        <span class="doc-name">{current.name}</span>
        <button type="button" onClick={openTitleForm}>
          Title page
        </button>
        <button type="button" onClick={() => editor.current?.openFind()}>
          Find
        </button>
        <button type="button" aria-pressed={drawerOpen} onClick={() => setDrawerOpen((o) => !o)}>
          Variables
        </button>
        <button
          type="button"
          aria-pressed={snapOpen}
          onClick={() => {
            setSnapOpen((o) => !o);
            refreshSnaps();
          }}
        >
          Snapshots
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
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {toast && (
        <div class="toast" role="status">
          {toast}
        </div>
      )}
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
            spell={spellHooks}
            spellVersion={spellVersion}
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
        {snapOpen && (
          <SnapshotPanel
            entries={snapEntries}
            deviceOnly={snapshots.deviceOnly}
            focusSeq={focusSeq}
            getCurrent={() => editor.current?.getText() ?? session.text}
            readSnapshot={(s) => snapshots.read(s)}
            onName={async (label) => {
              await snapshots.take(editor.current?.getText() ?? session.text, 'named', label);
              refreshSnaps();
            }}
            onRestore={async (s) => {
              const h = editor.current;
              if (!h) return;
              const old = h.getText();
              const text = await snapshots.restore(s, old);
              // One transaction, so a single undo brings the previous text back.
              h.apply([{ from: 0, to: old.length, insert: text }]);
              refreshSnaps();
              setToast(
                `Restored ${s.label ?? new Date(s.time).toLocaleString()}. Previous version saved as a snapshot.`,
              );
            }}
            onDelete={async (s) => {
              await snapshots.remove(s);
              refreshSnaps();
            }}
            onClose={() => setSnapOpen(false)}
          />
        )}
        {titleForm && (
          <TitlePageForm
            initial={titleForm}
            onCancel={() => setTitleForm(null)}
            onSave={(values) => {
              const h = editor.current;
              if (h) {
                const t = h.getText();
                h.apply(titlePageChanges(t, diffTitleValues(t, values)), 'input.title');
              }
              setTitleForm(null);
            }}
          />
        )}
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
