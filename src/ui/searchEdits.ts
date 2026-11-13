import type { EditorState, TransactionSpec } from '@codemirror/state';
import { findMatches, type SearchOptions } from '../engine/search';
import { asUndoStep } from './historyConfig';

/** Replaces every match in one transaction (one undo step); null when nothing matches. */
export function replaceAllSpec(
  state: EditorState,
  query: string,
  replacement: string,
  opts: SearchOptions,
): TransactionSpec | null {
  const matches = findMatches(state.doc.toString(), query, opts);
  if (matches.length === 0) return null;
  return asUndoStep(
    { changes: matches.map((m) => ({ from: m.from, to: m.to, insert: replacement })) },
    'input.replace.all',
  );
}
