import nspell from 'nspell';
import { checkableWords, scriptWords, wordKey } from '../engine/spellScan';

export interface Misspelling {
  from: number;
  to: number;
  word: string;
}

export const MAX_SUGGESTIONS = 5;
/** Only en_US ships; the key is here so a language setting can be added later. */
export const SPELL_LANGUAGES = ['en_US'] as const;
export const SPELL_LANGUAGE_KEY = 'spellLanguage';

/**
 * Hunspell checker over Fountain text. `personal` (the writer's dictionary) and `ignored` (this
 * script only) are lower-case word lists; the script's own names are added on every `check`.
 */
export class SpellChecker {
  private readonly speller;
  constructor(aff: string, dic: string) {
    this.speller = nspell(aff, dic);
  }

  private correct(word: string): boolean {
    const w = word.replace(/’/g, "'");
    return this.speller.correct(w) || (w !== w.toLowerCase() && this.speller.correct(w.toLowerCase()));
  }

  check(
    text: string,
    opts: { personal?: Iterable<string>; ignored?: Iterable<string>; range?: { from: number; to: number } } = {},
  ): Misspelling[] {
    const accepted = scriptWords(text);
    for (const w of opts.personal ?? []) accepted.add(wordKey(w));
    for (const w of opts.ignored ?? []) accepted.add(wordKey(w));
    const cache = new Map<string, boolean>();
    const out: Misspelling[] = [];
    for (const w of checkableWords(text, opts.range)) {
      const key = wordKey(w.word);
      if (accepted.has(key) || accepted.has(key.replace(/'s$/, ''))) continue;
      let ok = cache.get(key);
      if (ok === undefined) {
        ok = this.correct(w.word);
        cache.set(key, ok);
      }
      if (!ok) out.push(w);
    }
    return out;
  }

  suggest(word: string): string[] {
    return this.speller.suggest(word.replace(/’/g, "'")).slice(0, MAX_SUGGESTIONS);
  }
}
