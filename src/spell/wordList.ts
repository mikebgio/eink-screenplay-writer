import type { KeyValueStore } from '../storage/recent';

export const PERSONAL_DICTIONARY_KEY = 'spell.personal';
export const ignoreKey = (fileUri: string) => `spell.ignore.${fileUri}`;

/** A list of words kept in a key-value store (Capacitor Preferences) as JSON. */
export class WordList {
  private words: string[] = [];
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string,
  ) {}

  private ready: Promise<string[]> | undefined;

  load(): Promise<string[]> {
    return (this.ready ??= this.read());
  }

  private async read(): Promise<string[]> {
    try {
      const raw = await this.store.get(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.words = Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : [];
    } catch {
      this.words = [];
    }
    return this.list();
  }

  list(): string[] {
    return [...this.words];
  }

  async add(word: string): Promise<string[]> {
    await this.load(); // never write before the stored list has been read
    const w = word.replace(/’/g, "'").trim();
    if (w && !this.words.some((x) => x.toLowerCase() === w.toLowerCase())) {
      this.words = [...this.words, w];
      await this.store.set(this.key, JSON.stringify(this.words));
    }
    return this.list();
  }
}
