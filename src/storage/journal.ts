/** Crash-recovery journal: app-private storage keyed by file URI. */
export interface JournalEntry {
  text: string;
  savedAt: number;
}

export interface JournalStore {
  get(key: string): Promise<JournalEntry | null>;
  set(key: string, entry: JournalEntry): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryJournal implements JournalStore {
  readonly entries = new Map<string, JournalEntry>();
  get(key: string) {
    return Promise.resolve(this.entries.get(key) ?? null);
  }
  set(key: string, entry: JournalEntry) {
    this.entries.set(key, entry);
    return Promise.resolve();
  }
  remove(key: string) {
    this.entries.delete(key);
    return Promise.resolve();
  }
}
