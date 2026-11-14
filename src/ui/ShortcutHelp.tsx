import { useEffect } from 'preact/hooks';
import { commands, formatKey } from './commands';

/** Lists every registered command with its shortcut. Esc, Ctrl+/ or the button closes it. */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const rows = commands.list().filter((c) => c.keys.length > 0);
  return (
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="modal shortcut-help">
        <h2>Keyboard shortcuts</h2>
        <table>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td class="shortcut-keys">{c.keys.map(formatKey).join('   ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
