import { useEffect, useRef } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { elementStyles } from './elementStyles';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';

/** CodeMirror 6 surface over raw Fountain text. No animations, no cursor blink (e-ink). */
export function Editor({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          drawSelection({ cursorBlinkRate: 0 }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          elementStyles,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, []);

  return <div class="editor-host" ref={host} />;
}
