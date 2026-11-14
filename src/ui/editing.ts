import { autocompletion, acceptCompletion, startCompletion } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { redo, undo } from '@codemirror/commands';
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  capitalizeInput,
  enter,
  force,
  suggestionsAt,
  tab,
  type EditState,
  type ForceKind,
  type Mode,
} from '../engine';
import { commands, registerCommand } from './commands';
import { hardwareKeyboardInputMode } from './hardwareKeyboard';

/**
 * Keyboard-first editing wired into CodeMirror. The behaviour lives in `src/engine/editing.ts` and
 * `completions.ts` (pure, unit-tested); this file only reads the editor state, applies the result and
 * registers the shortcuts.
 */

/** Capitalising mode of one line (set by Tab / Ctrl+3 / Ctrl+6 on an empty line). `pos` is the line start. */
const setMode = StateEffect.define<{ pos: number; mode: Mode }>();
const modeField = StateField.define<{ pos: number; mode: 'character' | 'transition' } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMode)) value = e.value.mode ? { pos: e.value.pos, mode: e.value.mode } : null;
    }
    if (!value) return null;
    const pos = tr.changes.mapPos(value.pos, -1);
    // The mode ends when the cursor leaves its line.
    if (tr.state.doc.lineAt(tr.state.selection.main.head).from !== pos) return null;
    return { ...value, pos };
  },
});

/** The capitalising mode of the cursor line, if any. */
export function currentMode(state: EditorState): Mode {
  return state.field(modeField, false)?.mode ?? null;
}

function read(state: EditorState): EditState | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  return { text: state.doc.toString(), cursor: sel.head, mode: currentMode(state) };
}

/** Applies `next` as one transaction: the smallest single change, the new cursor and the new mode. */
function apply(view: EditorView, prev: EditState, next: EditState): void {
  const a = prev.text;
  const b = next.text;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  const lineStart = next.text.lastIndexOf('\n', next.cursor - 1) + 1;
  view.dispatch({
    changes: start === endA && start === endB ? undefined : { from: start, to: endA, insert: b.slice(start, endB) },
    selection: { anchor: next.cursor },
    effects: setMode.of({ pos: lineStart, mode: next.mode ?? null }),
    scrollIntoView: true,
    userEvent: 'input.edit',
  });
}

function run(view: EditorView, step: (s: EditState) => EditState | null): boolean {
  const s = read(view.state);
  if (!s) return false;
  const next = step(s);
  if (!next) return true; // handled: Tab with no meaning here must not move focus out of the editor
  apply(view, s, next);
  if (next.mode) startCompletion(view);
  return true;
}

export const forceKinds: { key: string; kind: ForceKind; label: string }[] = [
  { key: 'Ctrl+1', kind: 'scene-heading', label: 'Scene heading' },
  { key: 'Ctrl+2', kind: 'action', label: 'Action' },
  { key: 'Ctrl+3', kind: 'character', label: 'Character' },
  { key: 'Ctrl+4', kind: 'parenthetical', label: 'Parenthetical' },
  { key: 'Ctrl+5', kind: 'dialogue', label: 'Dialogue' },
  { key: 'Ctrl+6', kind: 'transition', label: 'Transition' },
  { key: 'Ctrl+7', kind: 'centered', label: 'Centered' },
  { key: 'Ctrl+8', kind: 'lyric', label: 'Lyric' },
];

/** Registers the editor's own shortcuts in the central registry (once, when this module loads). */
function registerEditingCommands(): void {
  const editor = { scope: 'editor' as const };
  registerCommand({ id: 'edit.enter', label: 'New line (moves to the next element)', keys: 'Enter', ...editor, run: ({ view }) => !!view && run(view, enter) });
  registerCommand({
    id: 'edit.newline',
    label: 'Plain new line',
    keys: 'Shift+Enter',
    ...editor,
    run: ({ view }) => !!view && run(view, (s) => ({ text: s.text.slice(0, s.cursor) + '\n' + s.text.slice(s.cursor), cursor: s.cursor + 1, mode: null })),
  });
  registerCommand({ id: 'edit.tab', label: 'Next element mode (character, parenthetical, transition)', keys: 'Tab', ...editor, run: ({ view }) => !!view && run(view, (s) => tab(s)) });
  registerCommand({ id: 'edit.tab.back', label: 'Previous element mode', keys: 'Shift+Tab', ...editor, run: ({ view }) => !!view && run(view, (s) => tab(s, true)) });
  for (const f of forceKinds) {
    registerCommand({
      id: `edit.force.${f.kind}`,
      label: `Force ${f.label.toLowerCase()} (again to undo the forcing)`,
      keys: f.key,
      ...editor,
      run: ({ view }) => !!view && run(view, (s) => force(s, f.kind)),
    });
  }
  registerCommand({ id: 'edit.undo', label: 'Undo', keys: 'Ctrl+Z', ...editor, run: ({ view }) => !!view && undo(view) });
  registerCommand({ id: 'edit.redo', label: 'Redo', keys: 'Ctrl+Shift+Z', ...editor, run: ({ view }) => !!view && redo(view) });
}
registerEditingCommands();

/** Capitalises typed text per `capitalizeInput`. Pasted text and programmatic edits are never touched. */
const capitalizeTyping = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('input.type')) return tr;
  let single: { from: number; to: number; insert: string } | null = null;
  let count = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    count++;
    single = { from: fromA, to: toA, insert: inserted.toString() };
  });
  if (count !== 1 || !single) return tr;
  const fix = capitalizeInput(tr.startState.doc.toString(), single, currentMode(tr.startState));
  if (!fix) return tr;
  return [tr, { changes: { from: fix.from, to: fix.to, insert: fix.insert }, sequential: true }];
});

function source(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const typedHere = pos - line.from;
  if (!context.explicit && typedHere === 0 && currentMode(state) === null) return null;
  const r = suggestionsAt(state.doc.toString(), pos, currentMode(state));
  if (!r) return null;
  return {
    from: r.from,
    options: r.options.map((o) => ({ label: o.label, detail: o.detail, apply: o.apply, type: 'text' })),
    filter: true,
  };
}

const noAnimation = EditorView.baseTheme({
  '.cm-tooltip': { animation: 'none !important', transition: 'none !important' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { animation: 'none !important' },
});

/** Everything keyboard-first: Tab/Enter/force keys, capitalising, autocomplete and the on-screen keyboard. */
export function editingExtensions(): Extension[] {
  return [
    modeField,
    capitalizeTyping,
    autocompletion({ override: [source], icons: false, aboveCursor: false, maxRenderedOptions: 12 }),
    noAnimation,
    // An open suggestion list takes Tab before the Tab/Enter rules; the completion keymap handles Enter and Esc.
    Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }, ...commands.editorBindings()])),
    hardwareKeyboardInputMode(),
  ];
}
