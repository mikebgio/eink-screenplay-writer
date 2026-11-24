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

  it('undo after remote edits above and below a local edit reverts only the local one', () => {
    const doc = 'top\nkeep 1\nmiddle\nkeep 2\nbottom';
    let state = start(doc);
    const at = doc.indexOf('middle') + 'middle'.length;
    state = state.update({ changes: { from: at, insert: ' EDITED' } }).state;
    const remote = 'TOP from the Mac\nkeep 1\nmiddle EDITED\nkeep 2\nBOTTOM from the Mac\nmore';
    state = state.update(replaceDoc(state, remote, false)!).state;
    expect(state.doc.toString()).toBe(remote);
    expect(undone(state)).toBe(remote.replace(' EDITED', ''));
  });

  it('keeps undo intact in a long script with changes far apart', () => {
    const lines = Array.from({ length: 6000 }, (_, i) => (i % 3 === 2 ? '' : `Line ${i}.`));
    const doc = lines.join('\n');
    let state = start(doc);
    const at = doc.indexOf('Line 3000.') + 'Line 3000.'.length;
    state = state.update({ changes: { from: at, insert: ' EDITED' } }).state;
    const remote = state.doc
      .toString()
      .replace('Line 10.', 'Changed early.')
      .replace('Line 5980.', 'Changed late.');
    state = state.update(replaceDoc(state, remote, false)!).state;
    expect(state.doc.toString()).toBe(remote);
    expect(undone(state)).toBe(remote.replace(' EDITED', ''));
  });

  it.each([
    ['a\nb\nc', 'b\nc'],
    ['a\nb\nc', 'a\nb'],
    ['a\nb', 'a\nb\nc\nd'],
    ['b', 'a\nb'],
    ['', 'a\nb'],
    ['a\nb', ''],
    ['a\n', 'a'],
    ['a', 'a\n'],
    ['a\n\nb\n\nc', 'x\n\nb\n\n\nc\ny'],
    ['one\ntwo\nthree\nfour', 'zero\ntwo\nfour\nfive'],
  ])('produces exactly the new text (%j → %j)', (a, b) => {
    const state = start(a);
    const spec = replaceDoc(state, b, true)!;
    expect(state.update(spec).state.doc.toString()).toBe(b);
    expect(undone(state.update(spec).state)).toBe(a);
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
