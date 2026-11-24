/** Replacing the whole script with another version in place (ticket 12). No DOM: unit-tested. */
import { Transaction, type EditorState, type TransactionSpec } from '@codemirror/state';
import { diff, mapLine, textChange } from '../engine';
import { asUndoStep } from './historyConfig';

/**
 * One transaction that turns the document into `text`, keeping the cursor on (or near) its line.
 * `undoable` makes it one undo step (the writer's "Take theirs"). Otherwise it stays out of the
 * history, so undo never reverts another device's edits. Null when nothing differs.
 */
export function replaceDoc(
  state: EditorState,
  text: string,
  undoable: boolean,
): TransactionSpec | null {
  const old = state.doc.toString();
  const next = text.replace(/\r\n?/g, '\n');
  if (next === old) return null;
  const head = state.selection.main.head;
  const at = state.doc.lineAt(head);
  const changes = state.changes(textChange(old, next));
  const doc = changes.apply(state.doc);
  const line = doc.line(mapLine(diff(old, next), at.number - 1) + 1);
  const spec: TransactionSpec = {
    changes,
    selection: { anchor: Math.min(line.from + head - at.from, line.to) },
    scrollIntoView: true,
  };
  return undoable
    ? asUndoStep(spec, 'input.conflict')
    : { ...spec, annotations: Transaction.addToHistory.of(false) };
}
