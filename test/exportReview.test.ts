import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageFolder } from '../src/platform/browserStorage';
import { isCancel } from '../src/platform/isCancel';
import { MemoryStorage } from '../src/storage/memory';
import { saveExport } from '../src/storage/exportFile';

describe('saveExport order', () => {
  it('opens the picker before the file is built', async () => {
    const events: string[] = [];
    const storage = new MemoryStorage();
    storage.nextCreate = { uri: 'mem://a.pdf', name: 'a.pdf' };
    const pick = storage.pickCreate.bind(storage);
    storage.pickCreate = (name: string) => {
      events.push('pick');
      return pick(name);
    };
    await saveExport(storage, 'a.pdf', async () => {
      events.push('build');
      return new Uint8Array([1]);
    });
    expect(events).toEqual(['pick', 'build']);
  });

  it('does not build the file when the picker is cancelled', async () => {
    const storage = new MemoryStorage();
    storage.pickCreate = () => Promise.resolve(null);
    const build = vi.fn(() => new Uint8Array([1]));
    expect(await saveExport(storage, 'a.pdf', build)).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });
});

describe('LocalStorageFolder.pickCreate', () => {
  const store = new Map<string, string>();
  const stub = (typed: string | null) => {
    vi.stubGlobal('window', { prompt: () => typed });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    });
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
  });

  it('creates a script for a name typed without an extension', async () => {
    stub('Untitled');
    const ref = await new LocalStorageFolder().pickCreate('Untitled.fountain');
    expect(ref).toMatchObject({ uri: 'ls://Untitled', name: 'Untitled' });
    expect(store.has('fakefs:Untitled')).toBe(true);
  });

  it('keeps a typed .fountain name a script', async () => {
    stub('Act One.fountain');
    const ref = await new LocalStorageFolder().pickCreate('Untitled.fountain');
    expect(ref?.uri).toBe('ls://Act One.fountain');
  });

  it('turns an export into a download, adding the extension if it was dropped', async () => {
    stub('Big Fish');
    const ref = await new LocalStorageFolder().pickCreate('Big Fish – 2026-11-14.pdf');
    expect(ref).toEqual({ uri: 'download://Big Fish.pdf', name: 'Big Fish.pdf' });
    expect(store.size).toBe(0);
  });

  it('keeps the typed extension on an export', async () => {
    stub('draft.pdf');
    const ref = await new LocalStorageFolder().pickCreate('x.pdf');
    expect(ref?.name).toBe('draft.pdf');
  });
});

describe('isCancel', () => {
  it('recognises the two cancel signals', () => {
    expect(isCancel(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isCancel(new Error('Share canceled'))).toBe(true);
    expect(isCancel(new Error('Share cancelled'))).toBe(true);
  });

  it('treats other errors as failures, even ones that mention cancel', () => {
    expect(isCancel(new Error('Failed to cancel the pending transfer: disk full'))).toBe(false);
    expect(isCancel(new Error('Permission denied'))).toBe(false);
    expect(isCancel('Share canceled')).toBe(false);
    expect(isCancel(undefined)).toBe(false);
  });
});
