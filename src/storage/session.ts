import { createConflictCopy } from './conflictCopy';
import type { FileRef, StoragePort } from './port';
import type { JournalStore } from './journal';

/** Compares versions of a script that may differ only in line endings. */
const sameLines = (a: string, b: string) =>
  a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n');

export const AUTOSAVE_MS = 2000;
export const JOURNAL_MS = 1000;

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface Recovery {
  text: string;
  savedAt: number;
  baseVersion?: string;
}

/** The other side of an unresolved sync conflict. This side is always the session's live `text`. */
export interface Conflict {
  theirs: string;
  theirsVersion: string;
}

export type ConflictChoice = 'mine' | 'theirs' | 'both';

export type ResolveResult =
  /** Applied. `copy` is the new file holding the writer's version ("Keep both"). */
  | { kind: 'resolved'; copy?: FileRef }
  /**
   * `conflict` holds a newer version than the one the writer chose for, so the original is untouched.
   * `copy` is set if "Keep both" had already saved the writer's version by then.
   */
  | { kind: 'changed'; copy?: FileRef }
  /** Nothing to resolve, or the writer cancelled the save picker. */
  | { kind: 'cancelled' };

export type CheckResult = 'unchanged' | 'reloaded' | 'conflict';

/** Why the session replaced the text itself: the editor has to follow. */
export type ReplaceReason = 'reload' | 'theirs' | 'both';

export interface SessionOptions {
  storage: StoragePort;
  journal: JournalStore;
  /** Takes the safety copies before anything could lose a version (`SnapshotService`). */
  snapshots: { takeSafetyCopy(text: string): Promise<unknown> };
  onStatus?: (s: SaveStatus) => void;
  onConflict?: (c: Conflict | null) => void;
  /** Called synchronously when the session replaces `text` (not for the writer's own edits). */
  onReplace?: (text: string, reason: ReplaceReason) => void;
}

/**
 * One open document: text + last known version, debounced autosave (2 s), journal (1 s),
 * immediate save on background. Timers use setTimeout so fake timers drive it in tests.
 *
 * Every save re-reads the file first (ticket 12). If it changed elsewhere and there are local edits,
 * the session enters a conflict: nothing is written until `resolveConflict`, but the journal runs on.
 * Saves, foreground checks and resolutions run one at a time.
 */
export class DocumentSession {
  ref: FileRef | null = null;
  text = '';
  /** Version of the text last read from or written to the file. */
  baseVersion = '';
  status: SaveStatus = 'saved';
  conflict: Conflict | null = null;
  private savedText = '';
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private journalTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  /** Bumped by `open` and `close`, so queued work can tell its document has gone. */
  private generation = 0;

  constructor(private readonly o: SessionOptions) {}

  private get dirty(): boolean {
    return this.conflict !== null || this.text !== this.savedText;
  }

  /** Open a file. Returns a pending recovery if a journal differs from the file. */
  async open(ref: FileRef): Promise<Recovery | null> {
    this.clearTimers();
    const { text, version } = await this.o.storage.read(ref);
    this.generation++;
    this.ref = ref;
    this.text = text;
    this.savedText = text;
    this.baseVersion = version;
    this.setConflict(null);
    this.setStatus('saved');
    const entry = await this.o.journal.get(ref.uri);
    if (entry && entry.text !== text) {
      const { text: journalled, savedAt, baseVersion } = entry;
      return { text: journalled, savedAt, ...(baseVersion ? { baseVersion } : {}) };
    }
    if (entry) await this.o.journal.remove(ref.uri);
    return null;
  }

  /**
   * Leave the document. Unsaved text stays in the journal; with a pending conflict it is also
   * snapshotted first, because the journal can be discarded or typed over. Rejects, leaving the
   * document open, if that fails.
   */
  close(): Promise<void> {
    return this.enqueue(() => this.doClose());
  }

  private async doClose(): Promise<void> {
    if (this.conflict) await this.snapshotLocalText();
    if (this.ref && this.dirty) await this.setJournal(this.ref);
    this.generation++;
    this.clearTimers();
    this.ref = null;
    this.setConflict(null);
  }

  /**
   * Apply the journalled text as an unsaved edit and save soon. If the file has changed since those
   * edits were made, the save finds a conflict instead of overwriting it.
   */
  recover(r: Recovery): void {
    if (r.baseVersion) this.baseVersion = r.baseVersion;
    this.edit(r.text);
  }

  async discard(): Promise<void> {
    if (this.ref) await this.o.journal.remove(this.ref.uri);
  }

  edit(text: string): void {
    if (!this.ref) return;
    this.text = text;
    if (this.conflict) return this.scheduleJournal();
    if (text === this.savedText) {
      this.clearTimers();
      this.setStatus('saved');
      return;
    }
    this.setStatus('unsaved');
    this.scheduleAutosave();
    this.scheduleJournal();
  }

  /** Call from the Capacitor App `pause` event. */
  onBackground(): Promise<void> {
    return this.save();
  }

  /** Writes the local edits unless the file changed elsewhere. Does nothing during a conflict. */
  save(): Promise<void> {
    return this.enqueue(() => this.doSave());
  }

  /** Call on app resume and window focus: picks up changes made on another device. */
  onForeground(): Promise<CheckResult> {
    return this.enqueue(() => this.doCheck());
  }

  /**
   * Applies the writer's choice, after taking `pre-conflict` snapshots of both versions.
   * `seenVersion` is the `theirsVersion` on screen when they chose: a check queued ahead of this may
   * have found a newer one since, and then nothing is applied.
   */
  resolveConflict(choice: ConflictChoice, seenVersion: string): Promise<ResolveResult> {
    return this.enqueue(() => this.doResolve(choice, seenVersion));
  }

  /** Safety copy of the live text, repeated until no newer typing arrived while writing it. */
  private async snapshotLocalText(): Promise<string> {
    let text: string;
    do {
      text = this.text;
      await this.o.snapshots.takeSafetyCopy(text);
    } while (this.text !== text);
    return text;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    // A failed job must not poison the chain: later ones still run.
    const next = this.queue.catch(() => {}).then(job);
    this.queue = next;
    return next;
  }

  private async doSave(): Promise<void> {
    const ref = this.ref;
    if (!ref || this.conflict || this.text === this.savedText) return;
    const gen = this.generation;
    this.clearTimers();
    this.setStatus('saving');
    try {
      const remote = await this.o.storage.read(ref);
      if (gen !== this.generation) return;
      if (remote.version !== this.baseVersion) {
        await this.reconcile(ref, remote);
        return;
      }
      const text = this.text;
      const { version } = await this.o.storage.write(ref, text);
      if (gen !== this.generation) return;
      await this.markSaved(ref, text, version);
    } catch (e) {
      // Keep the edits unsaved (journal keeps running) and retry on the next autosave.
      if (gen === this.generation) {
        this.setStatus('unsaved');
        this.scheduleAutosave();
        this.scheduleJournal();
      }
      throw e;
    }
  }

  private async doCheck(): Promise<CheckResult> {
    const ref = this.ref;
    if (!ref) return 'unchanged';
    const gen = this.generation;
    const remote = await this.o.storage.read(ref);
    if (gen !== this.generation) return 'unchanged';
    if (this.conflict) {
      if (remote.version !== this.conflict.theirsVersion) {
        this.setConflict({ theirs: remote.text, theirsVersion: remote.version });
      }
      return 'conflict';
    }
    if (remote.version === this.baseVersion) return 'unchanged';
    return this.reconcile(ref, remote);
  }

  /** The file no longer matches `baseVersion`: adopt it if that loses nothing, else conflict. */
  private async reconcile(
    ref: FileRef,
    remote: { text: string; version: string },
  ): Promise<CheckResult> {
    if (sameLines(remote.text, this.text)) {
      // Both sides made the same change. Line endings alone aren't one, so nothing is written back.
      await this.markSaved(ref, this.text, remote.version);
      return 'unchanged';
    }
    if (this.text === this.savedText) {
      // The file may be stale or truncated: keep what it replaces.
      const outgoing = this.text;
      const gen = this.generation;
      await this.o.snapshots.takeSafetyCopy(outgoing);
      if (gen !== this.generation) return 'unchanged';
      // Typed while the snapshot was written: those are unsaved edits now.
      if (this.text !== outgoing) return this.reconcile(ref, remote);
      this.clearTimers();
      // The journal is left alone: it may hold a recovery the writer hasn't answered yet.
      this.replace(remote.text, remote.version, 'reload');
      return 'reloaded';
    }
    this.clearTimers();
    this.setStatus('unsaved');
    this.setConflict({ theirs: remote.text, theirsVersion: remote.version });
    await this.setJournal(ref);
    this.scheduleJournal();
    return 'conflict';
  }

  private async doResolve(choice: ConflictChoice, seenVersion: string): Promise<ResolveResult> {
    const ref = this.ref;
    const seen = this.conflict;
    if (!ref || !seen) return { kind: 'cancelled' };
    if (seen.theirsVersion !== seenVersion) return { kind: 'changed' };
    const gen = this.generation;
    const gone = () => gen !== this.generation;

    // Nothing is applied until both versions are safely stored.
    const mine = await this.snapshotLocalText();
    await this.o.snapshots.takeSafetyCopy(seen.theirs);

    /** True if the file is still the version the writer saw; otherwise shows them the new one. */
    const stillSeen = async () => {
      const remote = await this.o.storage.read(ref);
      if (gone()) return false;
      if (remote.version === seen.theirsVersion) return true;
      this.setConflict({ theirs: remote.text, theirsVersion: remote.version });
      return false;
    };
    if (!(await stillSeen())) return { kind: 'changed' };

    if (choice === 'mine') {
      const { version } = await this.o.storage.write(ref, mine);
      if (gone()) return { kind: 'resolved' };
      this.setConflict(null);
      await this.markSaved(ref, mine, version);
      return { kind: 'resolved' };
    }

    let copy: FileRef | undefined;
    if (choice === 'both') {
      const created = await createConflictCopy(this.o.storage, ref, new Date(), seen.theirs);
      if (!created) return { kind: 'cancelled' };
      await this.o.storage.write(created, mine);
      copy = created;
      // The picker may have been open a while: don't adopt a version the writer hasn't seen.
      if (!(await stillSeen())) return { kind: 'changed', copy };
    }
    this.clearTimers();
    this.setConflict(null);
    this.replace(seen.theirs, seen.theirsVersion, choice);
    await this.o.journal.remove(ref.uri);
    return { kind: 'resolved', ...(copy ? { copy } : {}) };
  }

  /** The file's text becomes the document's text. */
  private replace(text: string, version: string, reason: ReplaceReason): void {
    this.text = text;
    this.savedText = text;
    this.baseVersion = version;
    this.setStatus('saved');
    this.o.onReplace?.(text, reason);
  }

  /** `text` is what the file holds now. */
  private async markSaved(ref: FileRef, text: string, version: string): Promise<void> {
    this.clearTimers();
    this.savedText = text;
    this.baseVersion = version;
    if (this.text === text) {
      this.setStatus('saved');
      await this.o.journal.remove(ref.uri);
    } else {
      // Edited while the write was in flight: journal against the new version, save again.
      this.setStatus('unsaved');
      this.scheduleAutosave();
      await this.setJournal(ref);
      this.scheduleJournal();
    }
  }

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.save().catch(() => {}), AUTOSAVE_MS);
  }

  private scheduleJournal(): void {
    this.journalTimer ??= setTimeout(() => void this.writeJournal(), JOURNAL_MS);
  }

  private async writeJournal(): Promise<void> {
    this.journalTimer = undefined;
    if (!this.ref || !this.dirty) return;
    await this.setJournal(this.ref);
    if (this.dirty) this.scheduleJournal();
  }

  private setJournal(ref: FileRef): Promise<void> {
    return this.o.journal.set(ref.uri, {
      text: this.text,
      savedAt: Date.now(),
      baseVersion: this.baseVersion,
    });
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

  private setConflict(c: Conflict | null): void {
    if (c === this.conflict) return;
    this.conflict = c;
    this.o.onConflict?.(c);
  }
}
