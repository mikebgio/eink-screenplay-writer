import type { FileRef, StoragePort } from './port';
import type { JournalStore } from './journal';

export const AUTOSAVE_MS = 2000;
export const JOURNAL_MS = 1000;

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface Recovery {
  text: string;
  savedAt: number;
}

export interface SessionOptions {
  storage: StoragePort;
  journal: JournalStore;
  onStatus?: (s: SaveStatus) => void;
}

/**
 * One open document: text + last known version, debounced autosave (2 s), journal (1 s),
 * immediate save on background. Timers use setTimeout so fake timers drive it in tests.
 */
export class DocumentSession {
  ref: FileRef | null = null;
  text = '';
  /** Last version read or written; ticket 12 uses this for conflict detection. */
  version = '';
  status: SaveStatus = 'saved';
  private savedText = '';
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private journalTimer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly o: SessionOptions) {}

  /** Open a file. Returns a pending recovery if a journal differs from the file. */
  async open(ref: FileRef): Promise<Recovery | null> {
    this.clearTimers();
    const { text, version } = await this.o.storage.read(ref);
    this.ref = ref;
    this.text = text;
    this.savedText = text;
    this.version = version;
    this.setStatus('saved');
    const entry = await this.o.journal.get(ref.uri);
    if (entry && entry.text !== text) return { text: entry.text, savedAt: entry.savedAt };
    if (entry) await this.o.journal.remove(ref.uri);
    return null;
  }

  /** Apply the journalled text as an unsaved edit and save soon. */
  recover(r: Recovery): void {
    this.edit(r.text);
  }

  async discard(): Promise<void> {
    if (this.ref) await this.o.journal.remove(this.ref.uri);
  }

  edit(text: string): void {
    if (!this.ref) return;
    this.text = text;
    if (text === this.savedText) {
      this.clearTimers();
      this.setStatus('saved');
      return;
    }
    this.setStatus('unsaved');
    clearTimeout(this.autosaveTimer);
    this.scheduleAutosave();
    if (!this.journalTimer) {
      this.journalTimer = setTimeout(() => void this.writeJournal(), JOURNAL_MS);
    }
  }

  /** Call from the Capacitor App `pause` event. */
  onBackground(): Promise<void> {
    return this.save();
  }

  save(): Promise<void> {
    // A failed save must not poison the chain: later saves still run.
    const next = this.saving.catch(() => {}).then(() => this.doSave());
    this.saving = next;
    return next;
  }

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.save().catch(() => {}), AUTOSAVE_MS);
  }

  private async doSave(): Promise<void> {
    const ref = this.ref;
    if (!ref || this.text === this.savedText) return;
    this.clearTimers();
    const text = this.text;
    this.setStatus('saving');
    let version: string;
    try {
      ({ version } = await this.o.storage.write(ref, text));
    } catch (e) {
      // Keep the edits unsaved (journal keeps running) and retry on the next autosave.
      if (this.ref === ref) {
        this.setStatus('unsaved');
        this.scheduleAutosave();
        if (!this.journalTimer) {
          this.journalTimer = setTimeout(() => void this.writeJournal(), JOURNAL_MS);
        }
      }
      throw e;
    }
    this.savedText = text;
    this.version = version;
    if (this.text === text) {
      await this.o.journal.remove(ref.uri);
      this.setStatus('saved');
    } else {
      // Edited while the write was in flight: keep the journal, save again.
      this.setStatus('unsaved');
      this.scheduleAutosave();
    }
  }

  private async writeJournal(): Promise<void> {
    this.journalTimer = undefined;
    if (!this.ref || this.text === this.savedText) return;
    await this.o.journal.set(this.ref.uri, { text: this.text, savedAt: Date.now() });
    if (this.text !== this.savedText) {
      this.journalTimer = setTimeout(() => void this.writeJournal(), JOURNAL_MS);
    }
  }

  private clearTimers(): void {
    clearTimeout(this.autosaveTimer);
    clearTimeout(this.journalTimer);
    this.autosaveTimer = undefined;
    this.journalTimer = undefined;
  }

  private setStatus(s: SaveStatus): void {
    this.status = s;
    this.o.onStatus?.(s);
  }
}
