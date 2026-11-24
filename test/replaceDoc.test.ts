import { describe, expect, it } from 'vitest';
import { undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { historyExtension } from '../src/ui/historyConfig';
import { replaceDoc } from '../src/ui/replaceDoc';

const start = (doc: string, cursor = 0) =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: [historyExtension()] });

const undone = (state: EditorState) => {
  let next = state;
  undo({ state, dispatch: (tr: Transaction) => (next = tr.state) });
  return next.doc.toString();
};

const cursorLine = (s: EditorState) => s.doc.lineAt(s.selection.main.head).text;

describe('replacing the document from outside', () => {
  const OLD = 'one\ntwo\nthree';

  it('keeps the cursor on the same line when lines appear above it', () => {
    const state = start(OLD, OLD.indexOf('two') + 2);
    const next = state.update(replaceDoc(state, 'zero\none\ntwo\nthree', false)!).state;
    expect(next.doc.toString()).toBe('zero\none\ntwo\nthree');
    expect(cursorLine(next)).toBe('two');
  });

  it('a silent reload is not undone: undo only reverts the writer’s own typing', () => {
    let state = start(OLD);
    state = state.update({ changes: { from: OLD.length, insert: ' mine' } }).state;
    state = state.update(replaceDoc(state, 'remote\none\ntwo\nthree mine', false)!).state;
    expect(undone(state)).toBe('remote\none\ntwo\nthree');
  });

  it('taking the other version is one undo step', () => {
    const state = start(OLD);
    const next = state.update(replaceDoc(state, 'completely\ndifferent', true)!).state;
    expect(undone(next)).toBe(OLD);
  });

  it('normalises line endings and does nothing when the text is the same', () => {
    expect(replaceDoc(start(OLD), 'one\r\ntwo\r\nthree', false)).toBeNull();
  });
});
