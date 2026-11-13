import { useEffect, useMemo, useState } from 'preact/hooks';
import { paginate, parse } from '../engine';
import { Editor } from './Editor';
import { PrintView } from './PrintView';
import { SAMPLE_SCRIPT } from './sample';

const DEBOUNCE_MS = 150;

export function App() {
  const [text, setText] = useState(SAMPLE_SCRIPT);
  const [debounced, setDebounced] = useState(SAMPLE_SCRIPT);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const paged = useMemo(() => paginate(parse(debounced)), [debounced]);

  return (
    <div class="app">
      <section class="pane pane-editor">
        <Editor initial={SAMPLE_SCRIPT} onChange={setText} />
      </section>
      <section class="pane pane-print">
        <PrintView paged={paged} pageIndex={0} />
      </section>
    </div>
  );
}
