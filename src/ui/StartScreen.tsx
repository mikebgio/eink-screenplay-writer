import type { FileRef } from '../storage/port';

export function StartScreen(props: {
  recents: FileRef[];
  workspaceFiles: FileRef[] | null;
  error: string | null;
  onNew: () => void;
  onOpen: () => void;
  onFolder: () => void;
  onPick: (ref: FileRef) => void;
}) {
  const list = (title: string, files: FileRef[]) => (
    <section>
      <h2>{title}</h2>
      <ul class="file-list">
        {files.map((f) => (
          <li key={f.uri}>
            <button type="button" onClick={() => props.onPick(f)}>
              {f.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <main class="start">
      <h1>Scriptwriter</h1>
      <div class="start-actions">
        <button type="button" onClick={props.onNew}>
          New script
        </button>
        <button type="button" onClick={props.onOpen}>
          Open file
        </button>
        <button type="button" onClick={props.onFolder}>
          Choose workspace folder
        </button>
      </div>
      {props.error && <p class="error">{props.error}</p>}
      {props.workspaceFiles && list('Workspace', props.workspaceFiles)}
      {props.recents.length > 0 && list('Recent files', props.recents)}
    </main>
  );
}
