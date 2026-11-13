import { useEffect, useRef, useState } from 'preact/hooks';
import type { TitleEntry, VariableDiagnostic, VariableUse } from '../engine';

export const VALUE_DEBOUNCE_MS = 300;

/** Result of an edit; a string is an error message to show. */
export type DrawerResult = string | null | undefined;

export interface DrawerProps {
  variables: TitleEntry[];
  diagnostics: VariableDiagnostic[];
  uses: VariableUse[];
  /** 1-based page of an element, or undefined when it isn't printed. */
  pageOf: (elementIndex: number) => number | undefined;
  onSetValue: (key: string, value: string) => DrawerResult;
  onRename: (key: string, to: string) => DrawerResult;
  onDelete: (key: string, uses: 'inline' | 'undefine') => void;
  onJump: (use: VariableUse) => void;
  onClose: () => void;
}

function ValueField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => DrawerResult;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const pending = useRef<string | null>(null);

  // Follow changes made elsewhere (undo, typing in the editor), unless the writer is typing here.
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(value);
  }, [value]);
  // Closing the drawer inside the debounce must not drop the last edit: flush it on unmount.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) commit.current(pending.current);
    },
    [],
  );

  return (
    <>
      <input
        ref={input}
        type="text"
        aria-label="Value"
        value={draft}
        onInput={(e) => {
          const v = e.currentTarget.value;
          setDraft(v);
          clearTimeout(timer.current);
          pending.current = v;
          timer.current = setTimeout(() => {
            pending.current = null;
            setError(commit.current(v) ?? null);
          }, VALUE_DEBOUNCE_MS);
        }}
      />
      {error && <div class="var-error" role="alert">{error}</div>}
    </>
  );
}

function Row({ v, props }: { v: TitleEntry; props: DrawerProps }) {
  const uses = props.uses.filter((u) => u.key === v.key);
  const [mode, setMode] = useState<'closed' | 'menu' | 'rename' | 'delete' | 'uses'>('closed');
  const [name, setName] = useState(v.key);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setMode('closed');
    setError(null);
  };
  return (
    <li class="var-row">
      <div class="var-line">
        <span class="var-key">{v.key}</span>
        <ValueField value={v.value} onCommit={(val) => props.onSetValue(v.key, val)} />
        <span class="var-count" title="Uses in the script">{uses.length}</span>
        <button
          type="button"
          aria-label={`Options for ${v.key}`}
          onClick={() => (mode === 'closed' ? setMode('menu') : close())}
        >
          ⋯
        </button>
      </div>
      {mode === 'menu' && (
        <div class="var-menu">
          <button type="button" onClick={() => { setName(v.key); setMode('rename'); }}>Rename</button>
          <button
            type="button"
            onClick={() => (uses.length > 0 ? setMode('delete') : props.onDelete(v.key, 'undefine'))}
          >
            Delete
          </button>
          <button type="button" onClick={() => setMode('uses')}>Show uses</button>
        </div>
      )}
      {mode === 'rename' && (
        <div class="var-menu">
          <input
            type="text"
            aria-label="New key"
            value={name}
            onInput={(e) => setName(e.currentTarget.value.toUpperCase())}
          />
          <button
            type="button"
            onClick={() => {
              const err = props.onRename(v.key, name);
              if (err) setError(err);
              else close();
            }}
          >
            Rename
          </button>
          <button type="button" onClick={close}>Cancel</button>
        </div>
      )}
      {mode === 'delete' && (
        <div class="var-menu">
          <div>
            Replace {uses.length} {uses.length === 1 ? 'use' : 'uses'} with the current value, or leave
            them undefined?
          </div>
          <button type="button" onClick={() => props.onDelete(v.key, 'inline')}>Replace with value</button>
          <button type="button" onClick={() => props.onDelete(v.key, 'undefine')}>Leave undefined</button>
          <button type="button" onClick={close}>Cancel</button>
        </div>
      )}
      {mode === 'uses' && (
        <div class="var-uses">
          {uses.length === 0 && <div>Not used.</div>}
          {uses.map((u) => {
            const page = props.pageOf(u.elementIndex);
            return (
              <button type="button" key={u.from} onClick={() => props.onJump(u)}>
                {u.excerpt}
                {page !== undefined ? ` (p. ${page})` : ''}
              </button>
            );
          })}
        </div>
      )}
      {error && <div class="var-error" role="alert">{error}</div>}
    </li>
  );
}

function AddRow({
  initialKey,
  onAdd,
  onCancel,
}: {
  initialKey: string;
  onAdd: (key: string, value: string) => DrawerResult;
  onCancel?: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div class="var-row">
      <div class="var-line">
        <input
          type="text"
          aria-label="Key"
          placeholder="KEY"
          value={key}
          onInput={(e) => setKey(e.currentTarget.value.toUpperCase())}
        />
        <input
          type="text"
          aria-label="Value"
          placeholder="Value"
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <button
          type="button"
          onClick={() => {
            const err = onAdd(key, value);
            if (err) setError(err);
            else {
              setKey('');
              setValue('');
              setError(null);
              onCancel?.();
            }
          }}
        >
          + Add
        </button>
      </div>
      {error && <div class="var-error" role="alert">{error}</div>}
    </div>
  );
}

export function VariableDrawer(props: DrawerProps) {
  const [adding, setAdding] = useState<string | null>(null);
  const undef = props.diagnostics.filter((d) => d.kind === 'undefined');
  const add = (key: string, value: string): DrawerResult => {
    if (props.variables.some((v) => v.key === key)) return `${key} already exists`;
    return value.trim() === '' ? 'Enter a value' : props.onSetValue(key, value);
  };
  return (
    <aside class="drawer" aria-label="Variables">
      <div class="drawer-head">
        <h2>Variables</h2>
        <button type="button" onClick={props.onClose}>Close</button>
      </div>
      <ul class="file-list">
        {props.variables.map((v) => (
          <Row key={v.key} v={v} props={props} />
        ))}
      </ul>
      {undef.length > 0 && (
        <>
          <h3>Undefined</h3>
          <ul class="file-list">
            {undef.map((d) => (
              <li class="var-row" key={d.key}>
                <div class="var-line">
                  <span class="var-key">{d.key}</span>
                  <span class="var-count">{d.positions.length}</span>
                  <button type="button" onClick={() => setAdding(d.key)}>Add</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {adding !== null && (
        <AddRow key={adding} initialKey={adding} onAdd={add} onCancel={() => setAdding(null)} />
      )}
      <AddRow key="new" initialKey="" onAdd={add} />
    </aside>
  );
}
