import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { Misspelling } from '../spell/checker';
import { asUndoStep } from './historyConfig';
import type { SpellRequest, SpellResponse } from './spell.worker';

export const SPELL_DEBOUNCE_MS = 300;
/** Characters checked above and below the visible lines. */
const MARGIN = 1500;

export interface SpellHooks {
  personal(): string[];
  ignored(): string[];
  addToDictionary(word: string): void;
  ignoreInScript(word: string): void;
}

const setMarks = StateEffect.define<Misspelling[]>();
/** Dispatch to re-run the check now (after the word lists changed). */
export const recheckSpelling = StateEffect.define<null>();

const mark = Decoration.mark({ class: 'spell-error' });

const field = StateField.define<{ items: Misspelling[]; deco: DecorationSet }>({
  create: () => ({ items: [], deco: Decoration.none }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        const b = new RangeSetBuilder<Decoration>();
        for (const m of e.value) b.add(m.from, m.to, mark);
        return { items: e.value, deco: b.finish() };
      }
    }
    if (!tr.docChanged) return value;
    const items = value.items
      .map((m) => ({ ...m, from: tr.changes.mapPos(m.from, 1), to: tr.changes.mapPos(m.to, -1) }))
      .filter((m) => m.to > m.from);
    return { items, deco: value.deco.map(tr.changes) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

/** Dotted underline on misspellings, checked in a worker 300 ms after typing stops. */
export function spellExtension(hooks: SpellHooks): Extension {
  let worker: Worker | undefined;
  let nextId = 1;
  const waiting = new Map<number, (r: SpellResponse) => void>();

  const getWorker = (): Worker | undefined => {
    if (worker || typeof Worker === 'undefined') return worker;
    worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SpellResponse>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
    return worker;
  };
  const ask = <T extends SpellResponse>(req: SpellRequest & { id: number }): Promise<T | null> => {
    const w = getWorker();
    if (!w) return Promise.resolve(null);
    return new Promise((resolve) => {
      waiting.set(req.id, (r) => resolve(r as T));
      w.postMessage(req);
    });
  };

  const plugin = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      latest = 0;
      constructor(readonly view: EditorView) {
        this.schedule();
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(recheckSpelling))))
          this.schedule();
      }
      schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.run(), SPELL_DEBOUNCE_MS);
      }
      async run() {
        const { view } = this;
        const doc = view.state.doc;
        const vis = view.visibleRanges;
        if (vis.length === 0) return;
        const range = {
          from: Math.max(0, Math.min(...vis.map((r) => r.from)) - MARGIN),
          to: Math.min(doc.length, Math.max(...vis.map((r) => r.to)) + MARGIN),
        };
        const id = nextId++;
        this.latest = id;
        const r = await ask<Extract<SpellResponse, { kind: 'check' }>>({
          kind: 'check',
          id,
          text: doc.toString(),
          range,
          personal: hooks.personal(),
          ignored: hooks.ignored(),
        });
        // Stale answers are dropped; the edit that made them stale scheduled a new check.
        if (!r || this.latest !== id || view.state.doc !== doc) return;
        view.dispatch({ effects: setMarks.of(r.misspellings) });
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  );

  let menu: HTMLElement | undefined;
  const closeMenu = () => {
    menu?.remove();
    menu = undefined;
  };

  const handlers = EditorView.domEventHandlers({
    contextmenu(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const hit = view.state.field(field).items.find((m) => pos >= m.from && pos <= m.to);
      if (!hit) return false;
      event.preventDefault();
      void ask<Extract<SpellResponse, { kind: 'suggest' }>>({
        kind: 'suggest',
        id: nextId++,
        word: hit.word,
      }).then((r) => {
        openMenu(view, hit, r?.suggestions ?? [], event.clientX, event.clientY);
      });
      return true;
    },
  });

  function openMenu(view: EditorView, hit: Misspelling, suggestions: string[], x: number, y: number) {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'spell-menu';
    el.setAttribute('role', 'menu');
    const item = (label: string, run: () => void, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = cls;
      b.setAttribute('role', 'menuitem');
      b.onclick = () => {
        closeMenu();
        run();
        view.focus();
      };
      el.appendChild(b);
    };
    for (const s of suggestions.slice(0, 5)) {
      item(s, () =>
        view.dispatch(asUndoStep({ changes: { from: hit.from, to: hit.to, insert: s } }, 'input.spell')),
      );
    }
    if (suggestions.length === 0) {
      const none = document.createElement('div');
      none.className = 'spell-none';
      none.textContent = 'No suggestions';
      el.appendChild(none);
    }
    item('Add to dictionary', () => {
      hooks.addToDictionary(hit.word);
      view.dispatch({ effects: recheckSpelling.of(null) });
    }, 'spell-extra');
    item('Ignore in this script', () => {
      hooks.ignoreInScript(hit.word);
      view.dispatch({ effects: recheckSpelling.of(null) });
    }, 'spell-extra');
    document.body.appendChild(el);
    el.style.left = `${Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth - 4))}px`;
    el.style.top = `${Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight - 4))}px`;
    menu = el;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        closeMenu();
        document.removeEventListener('pointerdown', away, true);
        document.removeEventListener('keydown', away, true);
      }
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
  }

  return [field, plugin, handlers];
}
