import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conflictCopyName } from '../src/storage/conflictCopy';
import { MemoryJournal } from '../src/storage/journal';
import { MemoryStorage } from '../src/storage/memory';
import { syncHash, type SidecarStore } from '../src/storage/port';
import { DocumentSession, type Conflict, type ConflictChoice } from '../src/storage/session';
import { SnapshotService } from '../src/storage/snapshots';

const URI = 'mem://f/the-long-night.fountain';
const BASE = 'INT. ROOM - DAY\n\nBase.';
const MINE = 'INT. ROOM - DAY\n\nMine.';
const THEIRS = 'INT. ROOM - DAY\n\nTheirs.';

function memStore(): SidecarStore {
  const m = new Map<string, string>();
  return {
    list: () => Promise.resolve([...m.keys()]),
    read: (n) => Promise.resolve(m.get(n) ?? null),
    write: (n, t) => (m.set(n, t), Promise.resolve()),
    remove: (n) => (m.delete(n), Promise.resolve()),
  };
}

describe('sync conflicts', () => {
  let storage: MemoryStorage;
  let journal: MemoryJournal;
  let snapshots: SnapshotService;
  let session: DocumentSession;
  let conflicts: (Conflict | null)[];
  let replaced: [string, string][];

  const makeSession = () =>
    new DocumentSession({
      storage,
      journal,
      snapshots,
      onConflict: (c) => conflicts.push(c),
      onReplace: (text, reason) => replaced.push([text, reason]),
    });

  /** Opens the script with snapshots attached, as the app does. */
  async function start(folderUri: string | null = 'mem://f') {
    const ref = storage.seed(URI, BASE, folderUri ?? undefined);
    await session.open(ref);
    await snapshots.attach(ref, BASE, () => session.text);
    return ref;
  }

  /** Local unsaved edit, then the same file edited on another device. */
  async function conflicted(folderUri: string | null = 'mem://f') {
    const ref = await start(folderUri);
    session.edit(MINE);
    storage.simulateExternalEdit(URI, THEIRS);
    await vi.advanceTimersByTimeAsync(2000);
    return ref;
  }

  /** Chooses, as the screen does: for the version it is showing now. */
  const resolve = (choice: ConflictChoice) =>
    session.resolveConflict(choice, session.conflict?.theirsVersion ?? '');

  const preConflictTexts = async () => {
    const list = (await snapshots.list()).filter((s) => s.kind === 'pre-conflict');
    return Promise.all(list.map((s) => snapshots.read(s)));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 10, 5, 0));
    storage = new MemoryStorage();
    journal = new MemoryJournal();
    const stores = new Map<string, SidecarStore>();
    snapshots = new SnapshotService({
      storage,
      privateStore: (k) => stores.get(k) ?? (stores.set(k, memStore()), stores.get(k)!),
    });
    conflicts = [];
    replaced = [];
    session = makeSession();
  });
  afterEach(() => {
    snapshots.detach();
    vi.useRealTimers();
  });

  describe('detection', () => {
    it('autosave detects an external edit and does not write', async () => {
      await conflicted();
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(storage.writeCount).toBe(0);
      expect(session.conflict).toEqual({ theirs: THEIRS, theirsVersion: syncHash(THEIRS) });
      expect(session.baseVersion).toBe(syncHash(BASE));
      expect(session.status).toBe('unsaved');
      expect(conflicts.at(-1)).toEqual(session.conflict);
    });

    it('manual and background saves do not write either', async () => {
      await conflicted();
      await session.save();
      await session.onBackground();
      expect(storage.writeCount).toBe(0);
    });

    it('keeps journalling while the conflict is pending', async () => {
      await conflicted();
      expect(journal.entries.get(URI)?.text).toBe(MINE);
      session.edit('more of mine');
      await vi.advanceTimersByTimeAsync(1000);
      expect(journal.entries.get(URI)?.text).toBe('more of mine');
      expect(journal.entries.get(URI)?.baseVersion).toBe(syncHash(BASE));
    });

    it('stays pending when the local text goes back to the last saved text', async () => {
      await conflicted();
      session.edit(BASE);
      await vi.advanceTimersByTimeAsync(5000);
      expect(session.status).toBe('unsaved');
      expect(session.conflict).not.toBeNull();
      expect(journal.entries.get(URI)?.text).toBe(BASE);
      expect(storage.files.get(URI)).toBe(THEIRS);
    });

    it('identical text on both sides is not a conflict and is not written', async () => {
      await start();
      session.edit(MINE);
      storage.simulateExternalEdit(URI, MINE);
      await vi.advanceTimersByTimeAsync(2000);
      expect(session.conflict).toBeNull();
      expect(storage.writeCount).toBe(0);
      expect(session.baseVersion).toBe(syncHash(MINE));
      expect(session.status).toBe('saved');
      expect(journal.entries.has(URI)).toBe(false);
    });

    it('writes normally when the file did not change, and moves baseVersion on', async () => {
      await start();
      session.edit(MINE);
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.files.get(URI)).toBe(MINE);
      expect(session.baseVersion).toBe(syncHash(MINE));
    });

    it('does not write when the file cannot be re-read', async () => {
      await start();
      vi.spyOn(storage, 'read').mockRejectedValueOnce(new Error('offline'));
      session.edit(MINE);
      await expect(session.save()).rejects.toThrow('offline');
      expect(storage.writeCount).toBe(0);
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.files.get(URI)).toBe(MINE);
    });
  });

  describe('returning to the foreground', () => {
    it('silently reloads when there are no unsaved local edits', async () => {
      await start();
      storage.simulateExternalEdit(URI, THEIRS);
      expect(await session.onForeground()).toBe('reloaded');
      expect(session.text).toBe(THEIRS);
      expect(session.baseVersion).toBe(syncHash(THEIRS));
      expect(session.status).toBe('saved');
      expect(session.conflict).toBeNull();
      expect(replaced).toEqual([[THEIRS, 'reload']]);
      await vi.advanceTimersByTimeAsync(5000);
      expect(storage.writeCount).toBe(0);
    });

    it('keeps a pre-conflict snapshot of the text a reload replaces', async () => {
      await start();
      session.edit(MINE);
      await vi.advanceTimersByTimeAsync(2000); // saved
      storage.simulateExternalEdit(URI, ''); // e.g. a truncated copy from the sync app
      expect(await session.onForeground()).toBe('reloaded');
      expect(await preConflictTexts()).toEqual([MINE]);
    });

    it('does not reload when that snapshot cannot be written', async () => {
      await start();
      storage.simulateExternalEdit(URI, THEIRS);
      vi.spyOn(snapshots, 'takeSafetyCopy').mockRejectedValueOnce(new Error('disk full'));
      await expect(session.onForeground()).rejects.toThrow('disk full');
      expect(session.text).toBe(BASE);
      expect(session.baseVersion).toBe(syncHash(BASE));
      expect(replaced).toEqual([]);
    });

    it('treats an edit typed while that snapshot is written as unsaved', async () => {
      await start();
      storage.simulateExternalEdit(URI, THEIRS);
      const take = snapshots.takeSafetyCopy.bind(snapshots);
      vi.spyOn(snapshots, 'takeSafetyCopy').mockImplementationOnce((text) => {
        session.edit(MINE);
        return take(text);
      });
      expect(await session.onForeground()).toBe('conflict');
      expect(session.text).toBe(MINE);
      expect(replaced).toEqual([]);
    });

    // 10: another device may save with CRLF line endings.
    it('the same edit saved with CRLF is not a conflict', async () => {
      await start();
      session.edit(MINE);
      const crlf = MINE.replace(/\n/g, '\r\n');
      storage.simulateExternalEdit(URI, crlf);
      expect(await session.onForeground()).toBe('unchanged');
      expect(session.conflict).toBeNull();
      expect(session.status).toBe('saved');
      expect(session.baseVersion).toBe(syncHash(crlf));
      expect(journal.entries.has(URI)).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(storage.files.get(URI)).toBe(crlf);
      expect(storage.writeCount).toBe(0);
      session.edit('next');
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.files.get(URI)).toBe('next');
    });

    it('does nothing when the file is unchanged', async () => {
      await start();
      session.edit(MINE);
      expect(await session.onForeground()).toBe('unchanged');
      expect(replaced).toEqual([]);
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.files.get(URI)).toBe(MINE);
    });

    it('reports a conflict when there are unsaved local edits', async () => {
      await start();
      session.edit(MINE);
      storage.simulateExternalEdit(URI, THEIRS);
      expect(await session.onForeground()).toBe('conflict');
      expect(session.text).toBe(MINE);
      expect(journal.entries.get(URI)?.text).toBe(MINE);
      await vi.advanceTimersByTimeAsync(5000);
      expect(storage.writeCount).toBe(0);
    });

    it('treats an edit typed while the file is being read as unsaved', async () => {
      await start();
      storage.simulateExternalEdit(URI, THEIRS);
      const check = session.onForeground();
      await Promise.resolve(); // the check has started its read
      session.edit(MINE);
      expect(await check).toBe('conflict');
      expect(session.text).toBe(MINE);
    });

    it('does not mistake its own write in flight for an external edit', async () => {
      await start();
      session.edit(MINE);
      const saving = session.save();
      const check = session.onForeground();
      await saving;
      expect(await check).toBe('unchanged');
      expect(session.conflict).toBeNull();
    });

    it('refreshes the other side of a pending conflict', async () => {
      await conflicted();
      storage.simulateExternalEdit(URI, 'newer');
      expect(await session.onForeground()).toBe('conflict');
      expect(session.conflict?.theirs).toBe('newer');
    });

    it('does nothing after the document is closed', async () => {
      await start();
      await session.close();
      storage.simulateExternalEdit(URI, THEIRS);
      expect(await session.onForeground()).toBe('unchanged');
      expect(replaced).toEqual([]);
    });
  });

  describe('resolving', () => {
    it('Keep mine writes the local text over the file', async () => {
      await conflicted();
      expect(await resolve('mine')).toEqual({ kind: 'resolved' });
      expect(storage.files.get(URI)).toBe(MINE);
      expect(session.text).toBe(MINE);
      expect(session.baseVersion).toBe(syncHash(MINE));
      expect(session.conflict).toBeNull();
      expect(session.status).toBe('saved');
      expect(journal.entries.has(URI)).toBe(false);
      expect(conflicts.at(-1)).toBeNull();
    });

    it('Take theirs replaces the local text and leaves the file alone', async () => {
      await conflicted();
      expect(await resolve('theirs')).toEqual({ kind: 'resolved' });
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(storage.writeCount).toBe(0);
      expect(session.text).toBe(THEIRS);
      expect(session.baseVersion).toBe(syncHash(THEIRS));
      expect(replaced).toEqual([[THEIRS, 'theirs']]);
      expect(session.status).toBe('saved');
      expect(journal.entries.has(URI)).toBe(false);
    });

    it('Keep both in folder mode saves mine next to the original and takes theirs', async () => {
      const ref = await conflicted();
      const create = vi.spyOn(storage, 'pickCreate');
      const result = await resolve('both');
      const uri = 'mem://f/the-long-night (conflict 2026-11-24 10-05).fountain';
      expect(result).toEqual({
        kind: 'resolved',
        copy: { uri, name: 'the-long-night (conflict 2026-11-24 10-05).fountain', folderUri: ref.folderUri },
      });
      expect(create).not.toHaveBeenCalled();
      expect(storage.files.get(uri)).toBe(MINE);
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(session.text).toBe(THEIRS);
      expect(session.baseVersion).toBe(syncHash(THEIRS));
      expect(session.ref).toBe(ref);
      expect(replaced).toEqual([[THEIRS, 'both']]);
    });

    it('Keep both never overwrites an earlier copy', async () => {
      await conflicted();
      const taken = 'mem://f/the-long-night (conflict 2026-11-24 10-05).fountain';
      storage.seed(taken, 'earlier copy', 'mem://f');
      const result = await resolve('both');
      expect(storage.files.get(taken)).toBe('earlier copy');
      expect(result.kind === 'resolved' && result.copy?.name).toBe(
        'the-long-night (conflict 2026-11-24 10-05) 2.fountain',
      );
    });

    it('Keep both in single-file mode asks the writer where to save mine', async () => {
      await conflicted(null);
      storage.nextCreate = { uri: 'mem://elsewhere/copy.fountain', name: '' };
      const create = vi.spyOn(storage, 'pickCreate');
      const result = await resolve('both');
      expect(create).toHaveBeenCalledWith('the-long-night (conflict 2026-11-24 10-05).fountain');
      expect(result.kind).toBe('resolved');
      expect(storage.files.get('mem://elsewhere/copy.fountain')).toBe(MINE);
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(session.text).toBe(THEIRS);
    });

    it('Keep both stays unresolved when the picker is cancelled', async () => {
      await conflicted(null);
      storage.nextCreate = null;
      expect(await resolve('both')).toEqual({ kind: 'cancelled' });
      expect(session.conflict).not.toBeNull();
      expect(session.text).toBe(MINE);
      expect(storage.files.get(URI)).toBe(THEIRS);
    });

    it('Keep both refuses to save the copy over the original', async () => {
      await conflicted(null);
      storage.nextCreate = { uri: URI, name: 'the-long-night.fountain' };
      await expect(resolve('both')).rejects.toThrow(/different file/);
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(session.conflict).not.toBeNull();
    });

    it.each(['mine', 'theirs', 'both'] as const)(
      'takes pre-conflict snapshots of both sides before applying "%s"',
      async (choice) => {
        await conflicted();
        const take = vi.spyOn(snapshots, 'takeSafetyCopy');
        const write = vi.spyOn(storage, 'write');
        const create = vi.spyOn(storage, 'createInFolder');
        await resolve(choice);
        expect(await preConflictTexts()).toEqual(expect.arrayContaining([MINE, THEIRS]));
        expect(await preConflictTexts()).toHaveLength(2);
        const lastSnapshot = Math.max(...take.mock.invocationCallOrder);
        for (const order of [...write.mock.invocationCallOrder, ...create.mock.invocationCallOrder])
          expect(order).toBeGreaterThan(lastSnapshot);
        expect(take).toHaveBeenCalledTimes(2);
      },
    );

    it('keeps a pre-conflict snapshot even when an auto snapshot has the same text', async () => {
      await start();
      session.edit(MINE);
      await snapshots.take(MINE, 'auto'); // an auto snapshot is prunable, so it is not a safety net by itself
      storage.simulateExternalEdit(URI, THEIRS);
      await vi.advanceTimersByTimeAsync(2000);
      await resolve('theirs');
      expect(await preConflictTexts()).toEqual(expect.arrayContaining([MINE, THEIRS]));
    });

    it('applies nothing when a snapshot cannot be written', async () => {
      await conflicted();
      vi.spyOn(snapshots, 'takeSafetyCopy').mockRejectedValue(new Error('disk full'));
      await expect(resolve('mine')).rejects.toThrow('disk full');
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(session.conflict).not.toBeNull();
      expect(session.text).toBe(MINE);
    });

    it.each(['mine', 'theirs', 'both'] as const)(
      'does not apply "%s" over a version the writer has not seen',
      async (choice) => {
        await conflicted();
        storage.simulateExternalEdit(URI, 'newer');
        expect(await resolve(choice)).toEqual({ kind: 'changed' });
        expect(storage.files.get(URI)).toBe('newer');
        expect(session.text).toBe(MINE);
        expect(session.conflict?.theirs).toBe('newer');
      },
    );

    it.each(['mine', 'theirs', 'both'] as const)(
      'does not apply "%s" when a queued check swaps the version after the button press',
      async (choice) => {
        await conflicted();
        const shown = session.conflict!.theirsVersion;
        storage.simulateExternalEdit(URI, 'newer');
        const check = session.onForeground(); // e.g. the click that refocused the window
        const result = session.resolveConflict(choice, shown);
        await check;
        expect(await result).toEqual({ kind: 'changed' });
        expect(storage.files.get(URI)).toBe('newer');
        expect(session.text).toBe(MINE);
      },
    );

    it('hands back the copy when the original changes during Keep both', async () => {
      await conflicted();
      const create = storage.createInFolder.bind(storage);
      vi.spyOn(storage, 'createInFolder').mockImplementation((folder, name) => {
        storage.simulateExternalEdit(URI, 'newer');
        return create(folder, name);
      });
      const result = await resolve('both');
      expect(result.kind).toBe('changed');
      expect(result.kind === 'changed' && result.copy?.name).toMatch(/\(conflict /);
      expect(session.conflict?.theirs).toBe('newer');
    });

    it('Keep both restores an original that the save picker emptied', async () => {
      const ref = await conflicted(null);
      vi.spyOn(storage, 'pickCreate').mockImplementation(() => {
        storage.simulateExternalEdit(URI, ''); // desktop Chrome clears a chosen existing file
        return Promise.resolve(ref);
      });
      await expect(resolve('both')).rejects.toThrow(/different file/);
      expect(storage.files.get(URI)).toBe(THEIRS);
    });

    it('Keep both leaves the original alone if the picker did not empty it', async () => {
      const ref = await conflicted(null);
      vi.spyOn(storage, 'pickCreate').mockImplementation(() => {
        storage.simulateExternalEdit(URI, 'newer');
        return Promise.resolve(ref);
      });
      await expect(resolve('both')).rejects.toThrow(/different file/);
      expect(storage.files.get(URI)).toBe('newer');
      expect(storage.writeCount).toBe(0);
    });

    it('cancelling keeps autosave off and keeps the conflict for the banner', async () => {
      await conflicted();
      // Cancel is a UI action: the session is simply left alone.
      session.edit('kept typing');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(storage.writeCount).toBe(0);
      expect(session.conflict).not.toBeNull();
    });

    it.each(['mine', 'theirs', 'both'] as const)('autosave resumes after "%s"', async (choice) => {
      await conflicted();
      await resolve(choice);
      session.edit('after');
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.files.get(URI)).toBe('after');
      expect(session.status).toBe('saved');
    });

    it('does nothing without a pending conflict', async () => {
      await start();
      expect(await resolve('mine')).toEqual({ kind: 'cancelled' });
      expect(storage.writeCount).toBe(0);
    });
  });

  describe('leaving and coming back', () => {
    it('a silent reload keeps an unanswered recovery journal', async () => {
      const ref = await start();
      await journal.set(URI, { text: MINE, savedAt: 1, baseVersion: syncHash(BASE) });
      expect(await session.open(ref)).not.toBeNull();
      storage.simulateExternalEdit(URI, THEIRS);
      expect(await session.onForeground()).toBe('reloaded');
      expect(journal.entries.get(URI)?.text).toBe(MINE);
    });

    it('closing keeps the unsaved text in the journal', async () => {
      await conflicted();
      session.edit('latest');
      await session.close();
      expect(journal.entries.get(URI)?.text).toBe('latest');
      expect(session.conflict).toBeNull();
      expect(conflicts.at(-1)).toBeNull();
    });

    it('closing with a pending conflict first snapshots the local text', async () => {
      await conflicted();
      session.edit('latest');
      await session.close();
      expect(await preConflictTexts()).toEqual(['latest']);
    });

    it('stays on the script when that snapshot cannot be written', async () => {
      const ref = await conflicted();
      vi.spyOn(snapshots, 'takeSafetyCopy').mockRejectedValueOnce(new Error('disk full'));
      await expect(session.close()).rejects.toThrow('disk full');
      expect(session.ref).toBe(ref);
      expect(session.conflict).not.toBeNull();
    });

    it('closing without a conflict takes no snapshot', async () => {
      await start();
      await session.close();
      expect(await preConflictTexts()).toEqual([]);
    });

    it('recovering edits older than the file is a conflict, not an overwrite', async () => {
      const ref = await conflicted();
      await session.close();
      const fresh = makeSession();
      const rec = await fresh.open(ref);
      expect(rec?.text).toBe(MINE);
      fresh.recover(rec!);
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.files.get(URI)).toBe(THEIRS);
      expect(fresh.conflict?.theirs).toBe(THEIRS);
    });
  });
});

describe('conflictCopyName', () => {
  const at = new Date(2026, 0, 2, 3, 4);
  it('replaces the extension and uses local date and time', () => {
    expect(conflictCopyName('Pilot.fountain', at)).toBe('Pilot (conflict 2026-01-02 03-04).fountain');
    expect(conflictCopyName('notes.txt', at)).toBe('notes (conflict 2026-01-02 03-04).fountain');
    expect(conflictCopyName('v1.2', at)).toBe('v1.2 (conflict 2026-01-02 03-04).fountain');
  });
});
