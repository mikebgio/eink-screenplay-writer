import { useEffect, useRef, useState } from 'preact/hooks';
import { TITLE_FIELDS, type TitleFieldId, type TitleValues } from '../engine';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-12" → "12 Nov 2026". */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

const MULTILINE: TitleFieldId[] = ['contact', 'notes'];

/** Title page form; [Save] hands back every field, and the caller writes one undoable edit. */
export function TitlePageForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: TitleValues;
  onSave: (values: TitleValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const set = (id: TitleFieldId, v: string) => setValues((s) => ({ ...s, [id]: v }));

  return (
    <div class="modal-backdrop" role="dialog" aria-label="Title page" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form
        class="modal title-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(values);
        }}
      >
        <h2>Title page</h2>
        {TITLE_FIELDS.map((f, i) => (
          <label key={f.id} class="field">
            <span>{f.label}</span>
            {MULTILINE.includes(f.id) ? (
              <textarea
                rows={f.id === 'contact' ? 3 : 2}
                value={values[f.id]}
                onInput={(e) => set(f.id, e.currentTarget.value)}
              />
            ) : f.id === 'draftDate' ? (
              <span class="date-row">
                <input
                  type="text"
                  value={values.draftDate}
                  placeholder="Second Draft – 12 Nov 2026"
                  onInput={(e) => set('draftDate', e.currentTarget.value)}
                />
                <input
                  type="date"
                  aria-label="Pick a date"
                  onInput={(e) => {
                    const d = formatDate(e.currentTarget.value);
                    if (d) set('draftDate', d);
                  }}
                />
              </span>
            ) : (
              <input
                ref={i === 0 ? first : undefined}
                type="text"
                value={values[f.id]}
                onInput={(e) => set(f.id, e.currentTarget.value)}
              />
            )}
          </label>
        ))}
        <div class="modal-actions">
          <button type="submit">Save</button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
