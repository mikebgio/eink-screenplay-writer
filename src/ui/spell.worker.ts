/// <reference lib="webworker" />
import affUrl from '../../node_modules/dictionary-en/index.aff?url';
import dicUrl from '../../node_modules/dictionary-en/index.dic?url';
import { SpellChecker, type Misspelling } from '../spell/checker';

export type SpellRequest =
  | {
      kind: 'check';
      id: number;
      text: string;
      range: { from: number; to: number };
      personal: string[];
      ignored: string[];
    }
  | { kind: 'suggest'; id: number; word: string };

export type SpellResponse =
  | { kind: 'check'; id: number; misspellings: Misspelling[] }
  | { kind: 'suggest'; id: number; suggestions: string[] }
  | { kind: 'error'; id: number };

// The dictionary loads on the first request, never at startup.
let checker: Promise<SpellChecker> | undefined;
const get = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.text();
  });
const load = () => {
  // A failed load is not cached, so the next request retries it.
  checker ??= Promise.all([get(affUrl), get(dicUrl)])
    .then(([aff, dic]) => new SpellChecker(aff, dic))
    .catch((e: unknown) => {
      checker = undefined;
      throw e;
    });
  return checker;
};

const post = (m: SpellResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<SpellRequest>) => {
  const req = e.data;
  void load()
    .then((c) => {
    if (req.kind === 'check') {
      post({
        kind: 'check',
        id: req.id,
        misspellings: c.check(req.text, {
          personal: req.personal,
          ignored: req.ignored,
          range: req.range,
        }),
      });
    } else {
      post({ kind: 'suggest', id: req.id, suggestions: c.suggest(req.word) });
    }
    })
    .catch(() => post({ kind: 'error', id: req.id }));
};
