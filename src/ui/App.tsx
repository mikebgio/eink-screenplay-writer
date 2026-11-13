import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { paginate, parse } from '../engine';
import { createStorage, FilesystemJournal, onBackground, preferencesStore } from '../platform';
import type { FileRef } from '../storage/port';
import { RecentFiles } from '../storage/recent';
import { DocumentSession, type Recovery, type SaveStatus } from '../storage/session';
import { newScriptTemplate } from '../storage/template';
import { Editor } from './Editor';
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

  useEffect(() => void recent.list().then(setRecents), [recent]);
  useEffect(() => onBackground(() => void session.onBackground()), [session]);
  useEffect(() => () => clearTimeout(timer.current), []);

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

  const paged = useMemo(() => paginate(parse(debounced)), [debounced]);

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
        <span class="save-status">{STATUS_LABEL[status]}</span>
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
        <section class="pane pane-editor">
          <Editor text={text} revision={revision} onChange={onChange} />
        </section>
        <section class="pane pane-print">
          <PrintView paged={paged} pageIndex={0} />
        </section>
      </div>
    </div>
  );
}
