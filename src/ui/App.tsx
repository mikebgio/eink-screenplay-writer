import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { paginate, parse } from '../engine';
import { Editor } from './Editor';
import { PrintView } from './PrintView';
import { SAMPLE_SCRIPT } from './sample';

const DEBOUNCE_MS = 150;

export function App() {
  const [debounced, setDebounced] = useState(SAMPLE_SCRIPT);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce in the callback (not via state) so keystrokes don't re-render the app.
  const onChange = useCallback((text: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const paged = useMemo(() => paginate(parse(debounced)), [debounced]);

  return (
    <div class="app">
      <section class="pane pane-editor">
        <Editor initial={SAMPLE_SCRIPT} onChange={onChange} />
      </section>
      <section class="pane pane-print">
        <PrintView paged={paged} pageIndex={0} />
      </section>
    </div>
  );
}
