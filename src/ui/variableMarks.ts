import { RangeSetBuilder, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { getVariables, parse, scanTokens } from '../engine';

const undefinedMark = Decoration.mark({
  class: 'var-undefined',
  attributes: { title: 'Undefined variable. Add it in the Variables drawer.' },
});
const invalidMark = Decoration.mark({
  class: 'var-invalid',
  attributes: { title: 'Variable keys must be UPPER_CASE' },
});

/** Dashed box on `{{KEY}}` with no `Var-KEY:` entry; a hint on `{{lower}}`. */
function build(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const b = new RangeSetBuilder<Decoration>();
  const tokens = scanTokens(text).filter((t) => t.kind !== 'escape');
  if (tokens.length === 0) return b.finish();
  const defined = new Set(getVariables(parse(text)).map((v) => v.key));
  for (const t of tokens) {
    if (t.kind === 'invalid') b.add(t.from, t.to, invalidMark);
    else if (!defined.has(t.key)) b.add(t.from, t.to, undefinedMark);
  }
  return b.finish();
}

const field = StateField.define<DecorationSet>({
  create: build,
  update: (value, tr) => (tr.docChanged ? build(tr.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});

export const variableMarks = [field];
