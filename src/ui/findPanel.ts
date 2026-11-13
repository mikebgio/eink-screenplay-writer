import type { Extension } from '@codemirror/state';
import { EditorView, keymap, type Panel, type ViewUpdate } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  setSearchQuery,
} from '@codemirror/search';
import { DEFAULT_SEARCH, findMatches, selectedMatch, stepMatch, type Match, type SearchOptions } from '../engine';
import { replaceAllSpec } from './searchEdits';
import { asUndoStep } from './historyConfig';

interface FindState {
  query: string;
  replacement: string;
  opts: SearchOptions;
}
const states = new WeakMap<EditorView, FindState>();

function stateOf(view: EditorView): FindState {
  let s = states.get(view);
  if (!s) {
    s = { query: '', replacement: '', opts: { ...DEFAULT_SEARCH } };
    states.set(view, s);
  }
  return s;
}

/** Moves the selection to a match without animation; the editor does not take focus from the panel. */
function select(view: EditorView, m: Match) {
  view.dispatch({
    selection: { anchor: m.from, head: m.to },
    effects: EditorView.scrollIntoView(m.from, { y: 'nearest' }),
  });
}

function createPanel(view: EditorView): Panel {
  const st = stateOf(view);
  // Opening with a selection searches for it (what openSearchPanel prefilled).
  const prefill = getSearchQuery(view.state).search;
  if (prefill && !prefill.includes('\n')) st.query = prefill;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const input = (name: string, label: string, value: string) => {
    const i = el('input', 'find-input');
    i.type = 'text';
    i.name = name;
    i.value = value;
    i.placeholder = label;
    i.setAttribute('aria-label', label);
    i.autocomplete = 'off';
    i.spellcheck = false;
    return i;
  };
  const button = (label: string, run: () => void) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.onclick = run;
    return b;
  };
  const toggle = (label: string, key: keyof SearchOptions) => {
    const b = el('button', 'find-toggle', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(st.opts[key]));
    b.onclick = () => {
      st.opts[key] = !st.opts[key];
      b.setAttribute('aria-pressed', String(st.opts[key]));
      refresh(true);
    };
    return b;
  };

  const dom = el('div', 'find-panel');
  const find = input('search', 'Find', st.query);
  find.setAttribute('main-field', 'true');
  const replace = input('replace', 'Replace', st.replacement);
  const count = el('span', 'find-count');
  count.setAttribute('aria-live', 'polite');

  let matches: Match[] = [];
  const compute = () => {
    matches = findMatches(view.state.doc.toString(), st.query, st.opts);
  };
  const updateCount = () => {
    const sel = view.state.selection.main;
    const i = selectedMatch(matches, sel);
    count.textContent =
      st.query === '' ? '' : matches.length === 0 ? 'No matches' : `${i < 0 ? '–' : i + 1} of ${matches.length}`;
  };
  /** Recomputes the matches; `jump` also moves to the first match at or after the cursor. */
  function refresh(jump: boolean) {
    // CodeMirror highlights every match of the same query.
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: st.query,
          caseSensitive: st.opts.caseSensitive,
          wholeWord: st.opts.wholeWord,
          literal: true,
        }),
      ),
    });
    compute();
    if (jump && matches.length > 0) {
      const sel = view.state.selection.main;
      const i = stepMatch(matches, { from: sel.from, to: sel.from }, 1);
      select(view, matches[i]!);
    }
    updateCount();
  }
  const step = (dir: 1 | -1) => {
    compute();
    const i = stepMatch(matches, view.state.selection.main, dir);
    if (i >= 0) select(view, matches[i]!);
    updateCount();
  };
  const replaceOne = () => {
    compute();
    const sel = view.state.selection.main;
    const i = selectedMatch(matches, sel);
    if (i < 0) return step(1);
    view.dispatch(
      asUndoStep(
        { changes: { from: sel.from, to: sel.to, insert: st.replacement }, selection: { anchor: sel.from + st.replacement.length } },
        'input.replace',
      ),
    );
    step(1);
  };
  const replaceAll = () => {
    const spec = replaceAllSpec(view.state, st.query, st.replacement, st.opts);
    if (spec) view.dispatch(spec);
    refresh(false);
  };
  const close = () => {
    closeSearchPanel(view);
    view.focus();
  };

  find.oninput = () => {
    st.query = find.value;
    refresh(true);
  };
  replace.oninput = () => (st.replacement = replace.value);
  dom.onkeydown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && (e.target === find || e.target === replace)) {
      e.preventDefault();
      if (e.target === replace && !e.shiftKey) replaceOne();
      else step(e.shiftKey ? -1 : 1);
    } else if (mod && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      find.focus();
      find.select();
    } else if (mod && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      replace.focus();
      replace.select();
    }
  };

  const row1 = el('div', 'find-row');
  row1.append(find, button('Previous', () => step(-1)), button('Next', () => step(1)), count);
  const row2 = el('div', 'find-row');
  row2.append(replace, button('Replace', replaceOne), button('Replace all', replaceAll));
  const row3 = el('div', 'find-row');
  row3.append(
    toggle('Match case', 'caseSensitive'),
    toggle('Whole word', 'wholeWord'),
    toggle('Include notes and boneyard', 'includeHidden'),
    button('Close', close),
  );
  dom.append(row1, row2, row3);

  compute();
  updateCount();
  return {
    dom,
    top: true,
    mount() {
      find.focus();
      find.select();
    },
    update(u: ViewUpdate) {
      if (u.docChanged) compute();
      if (u.docChanged || u.selectionSet) updateCount();
    },
  };
}

/** Opens the panel; `withReplace` puts the cursor in the Replace field. */
export function openFind(view: EditorView, withReplace = false): boolean {
  openSearchPanel(view);
  if (withReplace) view.dom.querySelector<HTMLInputElement>('.find-panel input[name=replace]')?.focus();
  return true;
}

/** `@codemirror/search` hosting a monochrome panel: Ctrl+F find, Ctrl+H replace, Esc close. */
export const findExtension: Extension = [
  search({ top: true, createPanel }),
  keymap.of([
    { key: 'Mod-f', run: (v) => openFind(v), preventDefault: true },
    { key: 'Ctrl-f', run: (v) => openFind(v), preventDefault: true },
    { key: 'Mod-h', run: (v) => openFind(v, true), preventDefault: true },
    { key: 'Ctrl-h', run: (v) => openFind(v, true), preventDefault: true },
    { key: 'Escape', run: closeSearchPanel },
  ]),
];
