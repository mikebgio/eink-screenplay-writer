import { useEffect, useRef, useState } from 'preact/hooks';
import type { StoragePort } from '../storage/port';
import { exportBytes, saveExport, suggestedExportName } from '../storage/exportFile';
import { loadPdfFonts, shareFile } from '../platform';
import { EXPORT_FORMATS, formatById, type ExportFormat } from './exportFormats';
import { blockingKeys, type ExportControl, type ExportOptions } from './exportOptions';

export interface ExportDialogProps {
  /** Options remembered for this document. */
  initial: ExportOptions;
  /** Keys used in the script that have no value (from `resolve`'s diagnostics). */
  undefinedKeys: string[];
  /** The script as written (read when the writer presses Save or Share, so it is never stale). */
  getText: () => string;
  /** Used for the suggested file name: the title-page title, or the file name. */
  title: string;
  storage: StoragePort;
  /** Called whenever an option changes, so the caller can remember it. */
  onChange: (options: ExportOptions) => void;
  /** [Define] on an undefined key: the caller closes the dialog and opens the variable drawer at that key. */
  onDefine: (key: string) => void;
  /** Called after a file was saved or shared; the message is for the toast. */
  onDone: (message: string) => void;
  onClose: () => void;
}

const PAPERS = [
  ['letter', 'US Letter'],
  ['a4', 'A4'],
] as const;
const SCENE_NUMBERS = [
  ['off', 'Off'],
  ['both', 'Both margins'],
] as const;
const VARIABLES = [
  ['fill', 'Fill in values'],
  ['keep', 'Keep {{KEY}}'],
] as const;

function Choice<T extends string>({
  legend,
  name,
  value,
  choices,
  onPick,
}: {
  legend: string;
  name: string;
  value: T;
  choices: readonly (readonly [T, string])[];
  onPick: (v: T) => void;
}) {
  return (
    <fieldset class="field choice">
      <legend>{legend}</legend>
      {choices.map(([v, label]) => (
        <label key={v}>
          <input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The export dialog (Ctrl+E): a modal with no animation. The format picker lists `EXPORT_FORMATS`; the
 * option controls shown are the ones the chosen format lists in `controls`. To add a format, add it to
 * that list (see exportFormats.ts); this component needs no change.
 */
export function ExportDialog(props: ExportDialogProps) {
  const { storage, getText, title } = props;
  const [options, setOptions] = useState(props.initial);
  const [anyway, setAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const format: ExportFormat = formatById(options.format);
  const shows = (c: ExportControl) => format.controls.includes(c);
  const set = <K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) => {
    const next = { ...options, [k]: v };
    setOptions(next);
    props.onChange(next);
  };
  const blocked = blockingKeys(props.undefinedKeys, options, format.controls, anyway);

  /** Builds the file, then hands it to `deliver`; a failure is shown in the dialog, not lost. */
  const run = async (deliver: (name: string, data: Uint8Array | string) => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const data = await format.run({ text: getText(), options, now, fonts: loadPdfFonts });
      const message = await deliver(suggestedExportName(title, now, format.extension), data);
      if (message) props.onDone(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async (name, data) => {
      const ref = await saveExport(storage, name, data);
      return ref ? `Saved ${ref.name}` : null;
    });
  const share = () =>
    run(async (name, data) => {
      const r = await shareFile(name, exportBytes(data), format.mime);
      return r === 'cancelled' ? null : r === 'downloaded' ? `Downloaded ${name}` : `Shared ${name}`;
    });

  return (
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Export"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          props.onClose();
        }
      }}
    >
      <form
        class="modal export-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (blocked.length === 0 && !busy) void save();
        }}
      >
        <h2>Export</h2>
        <fieldset class="field choice">
          <legend>Format</legend>
          {EXPORT_FORMATS.map((f, i) => (
            <label key={f.id}>
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name="export-format"
                checked={options.format === f.id}
                onChange={() => set('format', f.id)}
              />
              {f.label}
            </label>
          ))}
        </fieldset>
        {shows('paper') && (
          <Choice legend="Paper" name="export-paper" value={options.paper} choices={PAPERS} onPick={(v) => set('paper', v)} />
        )}
        {shows('sceneNumbers') && (
          <Choice
            legend="Scene numbers"
            name="export-scenes"
            value={options.sceneNumbers}
            choices={SCENE_NUMBERS}
            onPick={(v) => set('sceneNumbers', v)}
          />
        )}
        {shows('variables') && (
          <Choice
            legend="Variables"
            name="export-variables"
            value={options.variables}
            choices={VARIABLES}
            onPick={(v) => set('variables', v)}
          />
        )}
        {shows('watermark') && (
          <label class="field">
            <span>Watermark (optional)</span>
            <input
              type="text"
              value={options.watermark}
              placeholder="CONFIDENTIAL – DRAFT 3"
              onInput={(e) => set('watermark', e.currentTarget.value)}
            />
          </label>
        )}
        {shows('titlePage') && (
          <label class="field check">
            <input
              type="checkbox"
              checked={options.titlePage}
              onChange={(e) => set('titlePage', e.currentTarget.checked)}
            />
            Include title page
          </label>
        )}
        {props.undefinedKeys.length > 0 && shows('variables') && options.variables === 'fill' && (
          <div class="export-warning" role="alert">
            <strong>
              {props.undefinedKeys.length === 1
                ? '1 variable has no value'
                : `${props.undefinedKeys.length} variables have no value`}
            </strong>
            <ul>
              {props.undefinedKeys.map((k) => (
                <li key={k}>
                  <code>{`{{${k}}}`}</code>
                  <button type="button" onClick={() => props.onDefine(k)}>
                    Define
                  </button>
                </li>
              ))}
            </ul>
            <label class="check">
              <input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.currentTarget.checked)} />
              Export anyway (print {'{{KEY}}'})
            </label>
          </div>
        )}
        {error && (
          <div class="var-error" role="alert">
            {error}
          </div>
        )}
        <div class="modal-actions">
          <button type="submit" disabled={blocked.length > 0 || busy}>
            Save to file…
          </button>
          <button type="button" disabled={blocked.length > 0 || busy} onClick={() => void share()}>
            Share…
          </button>
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
