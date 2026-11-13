import { history, isolateHistory } from '@codemirror/commands';
import type { TransactionSpec } from '@codemirror/state';

/** A whole writing session of undo; a typing burst is one step, a pause of 1 s starts a new one. */
export const HISTORY_CONFIG = { minDepth: 10_000, newGroupDelay: 1000 } as const;

export const historyExtension = () => history(HISTORY_CONFIG);

/**
 * Marks a programmatic change (drawer edit, rename, restore, replace all, title page, ...) as its own
 * undo step: one transaction, never merged into the typing burst before or after it.
 */
export function asUndoStep(spec: TransactionSpec, userEvent: string): TransactionSpec {
  return { ...spec, userEvent, annotations: [...[spec.annotations ?? []].flat(), isolateHistory.of('full')] };
}
