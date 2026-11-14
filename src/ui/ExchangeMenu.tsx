import { useState } from 'preact/hooks';
import {
  exchangeFileName,
  exportFdxText,
  exportFountainText,
  saveTextExport,
} from '../storage/exchange';
import type { StoragePort } from '../storage/port';

/**
 * INTERIM (ticket 10): two buttons that save the script as FDX or as a clean Fountain copy.
 * Ticket 09's export dialog (Ctrl+E) replaces this: add `FDX_FORMAT` / `FOUNTAIN_FORMAT` to its
 * `EXPORT_FORMATS` (see ticket 10's Handoff notes), then delete this file and its one line in `App.tsx`.
 * It is deliberately self-contained and has no shortcut, so it can't clash with the dialog's.
 */
export function ExchangeMenu(props: {
  storage: StoragePort;
  scriptName: string;
  getText: () => string;
  /** Keys used in the script but not defined; they stay `{{KEY}}` in the FDX. */
  undefinedKeys: ReadonlySet<string>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [sceneNumbers, setSceneNumbers] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (kind: 'fdx' | 'fountain') => {
    setBusy(true);
    try {
      const text = props.getText();
      const name = exchangeFileName(props.scriptName, kind, { filled: kind === 'fountain' });
      const out = kind === 'fdx' ? exportFdxText(text, { sceneNumbers }) : exportFountainText(text);
      const ref = await saveTextExport(props.storage, name, out);
      if (!ref) return;
      const n = props.undefinedKeys.size;
      props.onDone(
        n > 0
          ? `Saved ${ref.name}. ${n} undefined variable${n === 1 ? '' : 's'} left as {{KEY}}.`
          : `Saved ${ref.name}.`,
      );
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span class="exchange-menu" role="group" aria-label="Export as FDX or Fountain">
      <button type="button" disabled={busy} onClick={() => void save('fdx')}>
        Export FDX
      </button>
      <button type="button" disabled={busy} onClick={() => void save('fountain')}>
        Export Fountain
      </button>
      <label>
        <input
          type="checkbox"
          checked={sceneNumbers}
          onChange={(e) => setSceneNumbers((e.currentTarget as HTMLInputElement).checked)}
        />{' '}
        FDX scene numbers
      </label>
    </span>
  );
}
