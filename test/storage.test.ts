import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from '../src/engine';
import { MemoryJournal } from '../src/storage/journal';
import { MemoryStorage } from '../src/storage/memory';
import { addRecent, RecentFiles, type KeyValueStore } from '../src/storage/recent';
import { DocumentSession } from '../src/storage/session';
import { newScriptTemplate } from '../src/storage/template';
import { hashText, type FileRef } from '../src/storage/port';

describe('DocumentSession', () => {
  let storage: MemoryStorage;
  let journal: MemoryJournal;
  let session: DocumentSession;
  let ref: FileRef;

  beforeEach(async () => {
    vi.useFakeTimers();
    storage = new MemoryStorage();
    journal = new MemoryJournal();
    ref = storage.seed('mem://docs/a.fountain', 'hello');
    session = new DocumentSession({ storage, journal });
    await session.open(ref);
  });
  afterEach(() => vi.useRealTimers());

  it('autosaves 2 s after the last edit, and not before', async () => {
    session.edit('hello w');
    await vi.advanceTimersByTimeAsync(1500);
    session.edit('hello world');
    await vi.advanceTimersByTimeAsync(1999);
    expect(storage.files.get(ref.uri)).toBe('hello');
    expect(session.status).toBe('unsaved');
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.files.get(ref.uri)).toBe('hello world');
    expect(session.status).toBe('saved');
    expect(storage.writeCount).toBe(1);
  });

  it('recovers from a failed write: stays unsaved, then later saves still run', async () => {
    const write = storage.write.bind(storage);
    vi.spyOn(storage, 'write')
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(write);
    session.edit('one');
    await expect(session.save()).rejects.toThrow('offline');
    expect(session.status).toBe('unsaved');
    await session.save();
    expect(storage.files.get(ref.uri)).toBe('one');
    expect(session.status).toBe('saved');
  });

  it('saves immediately when the app goes to the background', async () => {
    session.edit('bg');
    await session.onBackground();
    expect(storage.files.get(ref.uri)).toBe('bg');
    expect(session.status).toBe('saved');
  });

  it('writes the journal while unsaved and clears it after saving', async () => {
    session.edit('draft');
    await vi.advanceTimersByTimeAsync(1000);
    expect(journal.entries.get(ref.uri)?.text).toBe('draft');
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.files.get(ref.uri)).toBe('draft');
    expect(journal.entries.has(ref.uri)).toBe(false);
  });

  it('keeps the last known version after a read and a save', async () => {
    const v0 = session.version;
    session.edit('changed');
    await session.save();
    expect(session.version).not.toBe(v0);
    expect(session.version).toBe((await storage.read(ref)).version);
  });

  it('offers recovery after a simulated crash, and recovering restores the text', async () => {
    session.edit('unsaved work');
    await vi.advanceTimersByTimeAsync(1000); // journal written, then the app is killed
    const fresh = new DocumentSession({ storage, journal });
    const rec = await fresh.open(ref);
    expect(rec?.text).toBe('unsaved work');
    fresh.recover(rec!);
    expect(fresh.text).toBe('unsaved work');
    await fresh.save();
    expect(storage.files.get(ref.uri)).toBe('unsaved work');
    expect(journal.entries.has(ref.uri)).toBe(false);
  });

  it('discarding removes the journal and keeps the file text', async () => {
    session.edit('unsaved work');
    await vi.advanceTimersByTimeAsync(1000);
    const fresh = new DocumentSession({ storage, journal });
    const rec = await fresh.open(ref);
    expect(rec).not.toBeNull();
    await fresh.discard();
    expect(journal.entries.has(ref.uri)).toBe(false);
    expect(fresh.text).toBe('hello');
  });

  it('does not offer recovery when the journal matches the file', async () => {
    await journal.set(ref.uri, { text: 'hello', savedAt: 1 });
    const fresh = new DocumentSession({ storage, journal });
    expect(await fresh.open(ref)).toBeNull();
    expect(journal.entries.has(ref.uri)).toBe(false);
  });
});

describe('recent files', () => {
  const mk = (n: number): FileRef => ({ uri: `mem://${n}`, name: `${n}.fountain` });

  it('orders most recent first, without duplicates, capped at 10', () => {
    let list: FileRef[] = [];
    for (let i = 0; i < 12; i++) list = addRecent(list, mk(i));
    expect(list).toHaveLength(10);
    expect(list[0]!.uri).toBe('mem://11');
    list = addRecent(list, mk(5));
    expect(list).toHaveLength(10);
    expect(list[0]!.uri).toBe('mem://5');
    expect(list.filter((r) => r.uri === 'mem://5')).toHaveLength(1);
  });

  it('persists through a key-value store', async () => {
    const data = new Map<string, string>();
    const kv: KeyValueStore = {
      get: (k) => Promise.resolve(data.get(k) ?? null),
      set: (k, v) => (data.set(k, v), Promise.resolve()),
    };
    await new RecentFiles(kv).add(mk(1));
    await new RecentFiles(kv).add(mk(2));
    expect((await new RecentFiles(kv).list()).map((r) => r.uri)).toEqual(['mem://2', 'mem://1']);
  });
});

describe('MemoryStorage', () => {
  it('lists a folder and exposes sidecars only when the folder is known', async () => {
    const s = new MemoryStorage();
    const ref = s.seed('mem://f/a.fountain', 'x', 'mem://f');
    s.seed('mem://f/sub/b.fountain', 'y');
    expect((await s.listFolder('mem://f')).map((r) => r.name)).toEqual(['a.fountain']);
    expect(s.sidecar(ref)).not.toBeNull();
    expect(s.sidecar({ uri: 'mem://z', name: 'z' })).toBeNull();
  });

  it('simulates an external edit with a different version', async () => {
    const s = new MemoryStorage();
    const ref = s.seed('mem://a', 'one');
    const v1 = (await s.read(ref)).version;
    s.simulateExternalEdit('mem://a', 'two');
    expect((await s.read(ref)).version).not.toBe(v1);
  });
});

describe('new script template', () => {
  it('has a title page, today as the draft date, and a scene heading', () => {
    const text = newScriptTemplate(new Date('2026-11-13T12:00:00Z'));
    expect(text).toMatch(/^Title: .+\nCredit: .+\nAuthor: .*\nDraft date: 2026-11-13\n/);
    expect(text).toContain('FADE IN:');
    const doc = parse(text);
    expect(doc.titlePage.map((t) => t.key)).toEqual(['Title', 'Credit', 'Author', 'Draft date']);
    expect(doc.elements.some((e) => e.type === 'scene-heading')).toBe(true);
  });
});

describe('hashText', () => {
  it('is the SHA-256 hex of the UTF-8 text', async () => {
    expect(await hashText('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
