import { RangeSetBuilder, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { classifyLines } from '../engine';

const decos = new Map<string, Decoration>();
function lineDeco(kind: string): Decoration {
  let d = decos.get(kind);
  if (!d) decos.set(kind, (d = Decoration.line({ class: `el-${kind}` })));
  return d;
}

/** One line decoration per source line, classed `el-<element type>`; re-classified on every change. */
function build(state: EditorState): DecorationSet {
  const kinds = classifyLines(state.doc.toString());
  const b = new RangeSetBuilder<Decoration>();
  kinds.forEach((kind, i) => {
    if (kind !== 'blank')
      b.add(state.doc.line(i + 1).from, state.doc.line(i + 1).from, lineDeco(kind));
  });
  return b.finish();
}

const field = StateField.define<DecorationSet>({
  create: build,
  update: (value, tr) => (tr.docChanged ? build(tr.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});

/** Monochrome per-element styling for the Fountain editor (see styles.css, `.el-*`). */
export const elementStyles = [field];
