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
  | { kind: 'suggest'; id: number; suggestions: string[] };

// The dictionary loads on the first request, never at startup.
let checker: Promise<SpellChecker> | undefined;
const load = () =>
  (checker ??= Promise.all([
    fetch(affUrl).then((r) => r.text()),
    fetch(dicUrl).then((r) => r.text()),
  ]).then(([aff, dic]) => new SpellChecker(aff, dic)));

const post = (m: SpellResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<SpellRequest>) => {
  const req = e.data;
  void load().then((c) => {
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
  });
};
