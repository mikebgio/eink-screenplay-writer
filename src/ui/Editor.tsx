import { useEffect, useRef } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';

/**
 * CodeMirror 6 surface over raw Fountain text. No animations, no cursor blink (e-ink).
 * Uncontrolled while typing; to replace the whole document (open a file, recover), pass new
 * `text` together with a changed `revision`.
 */
export function Editor({
  text,
  revision,
  onChange,
}: {
  text: string;
  revision: number;
  onChange: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const latest = useRef({ text, revision });
  latest.current = { text, revision };

  const extensions = useRef([
    history(),
    drawSelection({ cursorBlinkRate: 0 }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        onChangeRef.current(u.state.doc.toString());
      }
    }),
  ]);

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: latest.current.text, extensions: extensions.current }),
    });
    view.current = v;
    return () => v.destroy();
  }, []);

  // Replace the whole document (fresh undo history) when the revision changes.
  const seen = useRef(revision);
  useEffect(() => {
    const v = view.current;
    if (!v || seen.current === revision) return;
    seen.current = revision;
    v.setState(EditorState.create({ doc: latest.current.text, extensions: extensions.current }));
  }, [revision]);

  return <div class="editor-host" ref={host} />;
}
