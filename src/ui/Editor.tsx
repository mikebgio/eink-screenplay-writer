import { useEffect, useRef } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { elementStyles } from './elementStyles';
import { variableMarks } from './variableMarks';
import type { TextChange } from '../engine';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';

/** What the rest of the app can do to the editor: variable edits and jumping to a use. */
export interface EditorHandle {
  getText(): string;
  /** Applies all changes as one transaction (one undo step). Offsets refer to the current text. */
  apply(changes: TextChange[]): void;
  /** Selects the range, scrolls it into view and focuses the editor. */
  reveal(from: number, to: number): void;
}

/**
 * CodeMirror 6 surface over raw Fountain text. No animations, no cursor blink (e-ink).
 * Uncontrolled while typing; to replace the whole document (open a file, recover), pass new
 * `text` together with a changed `revision`.
 */
export function Editor({
  text,
  revision,
  onChange,
  onCursorLine,
  jump,
  onReady,
}: {
  text: string;
  revision: number;
  onChange: (text: string) => void;
  /** Called with the 0-based source line whenever the cursor moves to a different line. */
  onCursorLine?: (line: number) => void;
  /** Move the cursor to a 0-based source line when `seq` changes. */
  jump?: { line: number; seq: number };
  onReady?: (handle: EditorHandle) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const latest = useRef({ text, revision });
  latest.current = { text, revision };
  const onCursorRef = useRef(onCursorLine);
  onCursorRef.current = onCursorLine;
  const lastLine = useRef(-1);

  const extensions = useRef([
    history(),
    drawSelection({ cursorBlinkRate: 0 }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    elementStyles,
    variableMarks,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        onChangeRef.current(u.state.doc.toString());
      }
      if (u.docChanged || u.selectionSet) {
        const line = u.state.doc.lineAt(u.state.selection.main.head).number - 1;
        if (line !== lastLine.current || u.docChanged) {
          lastLine.current = line;
          onCursorRef.current?.(line);
        }
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
    onReady?.({
      getText: () => v.state.doc.toString(),
      apply: (changes) => {
        if (changes.length > 0) v.dispatch({ changes, userEvent: 'input.variable' });
      },
      reveal: (from, to) => {
        const len = v.state.doc.length;
        v.dispatch({
          selection: { anchor: Math.min(from, len), head: Math.min(to, len) },
          scrollIntoView: true,
        });
        v.focus();
      },
    });
    return () => v.destroy();
  }, []);

  // Replace the whole document (fresh undo history) when the revision changes.
  const seen = useRef(revision);
  useEffect(() => {
    const v = view.current;
    if (!v || seen.current === revision) return;
    seen.current = revision;
    lastLine.current = 0; // the new state's cursor is on the first line
    v.setState(EditorState.create({ doc: latest.current.text, extensions: extensions.current }));
  }, [revision]);

  const seenJump = useRef(jump?.seq);
  useEffect(() => {
    const v = view.current;
    if (!v || !jump || seenJump.current === jump.seq) return;
    seenJump.current = jump.seq;
    const line = v.state.doc.line(Math.min(Math.max(jump.line + 1, 1), v.state.doc.lines));
    v.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    v.focus();
  }, [jump]);

  return <div class="editor-host" ref={host} />;
}
