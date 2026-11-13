import { RangeSetBuilder, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { findSpans, scanTokens, titlePageLayout, VAR_PREFIX, VARIABLE_KEY } from '../engine';

const undefinedMark = Decoration.mark({
  class: 'var-undefined',
  attributes: { title: 'Undefined variable. Add it in the Variables drawer.' },
});
const invalidMark = Decoration.mark({
  class: 'var-invalid',
  attributes: { title: 'Variable keys must be UPPER_CASE' },
});

/**
 * Dashed box on `{{KEY}}` with no `Var-KEY:` entry; a hint on `{{lower}}`. Like `resolve`, ignores
 * notes, boneyard and the `Var-` lines themselves. Reads only the title page, not a full parse.
 */
function build(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const b = new RangeSetBuilder<Decoration>();
  const tokens = scanTokens(text).filter((t) => t.kind !== 'escape');
  if (tokens.length === 0) return b.finish();
  const layout = titlePageLayout(text);
  const defs = layout?.entries.filter((e) => e.key.startsWith(VAR_PREFIX)) ?? [];
  const defined = new Set(
    defs.map((e) => e.key.slice(VAR_PREFIX.length)).filter((k) => VARIABLE_KEY.test(k)),
  );
  const spans = findSpans(text);
  for (const t of tokens) {
    if (defs.some((e) => t.from >= e.from && t.to <= e.to)) continue;
    if (spans.some((s) => t.from < s.to && t.to > s.from)) continue;
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
