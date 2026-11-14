import { useEffect, useState } from 'preact/hooks';
import type { LatencyRecorder } from '../platform';

const SAMPLE =
  'INT. KITCHEN - NIGHT\n\nMARA pours two coffees. She hesitates, then slides one across the counter. ' +
  'The clock above the stove ticks past three.';

const ms = (n: number | null) => (n === null ? '-' : `${n.toFixed(1)} ms`);

/**
 * Hidden debug panel (Ctrl+Shift+D, or long-press the document name): browser-side
 * keypress-to-render delay for the last 200 keys, with fast refresh on and off. It sits below the
 * editor so you can copy-type the sample paragraph into the editor. It cannot see the e-ink panel
 * itself; see docs/latency-test.md for the filmed test.
 */
export function LatencyPanel({
  recorder,
  fastEnabled,
  onFastEnabled,
  onClose,
}: {
  recorder: LatencyRecorder;
  fastEnabled: boolean;
  onFastEnabled: (on: boolean) => void;
  onClose: () => void;
}) {
  const [, tick] = useState(0);
  const [typeTest, setTypeTest] = useState(false);
  // Poll rather than re-render on every key (that would add load to what is being measured).
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = recorder.stats();
  return (
    <section class="latency-panel" aria-label="Typing latency (debug)">
      <div class="latency-head">
        <strong>Typing latency</strong>
        <label>
          <input
            type="checkbox"
            checked={fastEnabled}
            onChange={(e) => onFastEnabled(e.currentTarget.checked)}
          />{' '}
          Fast refresh while typing
        </label>
        <button type="button" aria-pressed={typeTest} onClick={() => setTypeTest((t) => !t)}>
          Type test
        </button>
        <button type="button" onClick={() => recorder.clear()}>
          Reset
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Keys</th>
            <th>Median</th>
            <th>95th pct</th>
          </tr>
        </thead>
        <tbody>
          {(['fast', 'normal'] as const).map((m) => (
            <tr key={m}>
              <td>{m === 'fast' ? 'Fast on' : 'Fast off'}</td>
              <td>{s[m].count}</td>
              <td>{ms(s[m].median)}</td>
              <td>{ms(s[m].p95)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {typeTest && (
        <p class="latency-sample">
          Copy-type into the editor above (keystrokes outside the editor aren't measured):
          <br />
          <code>{SAMPLE}</code>
        </p>
      )}
    </section>
  );
}
