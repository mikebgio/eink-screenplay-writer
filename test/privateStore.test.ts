import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readdir: ({ path }: { path: string }) => {
      const names = [...files.keys()]
        .filter((k) => k.startsWith(`${path}/`))
        .map((k) => k.slice(path.length + 1));
      if (!names.length) return Promise.reject(new Error('no dir'));
      return Promise.resolve({ files: names.map((name) => ({ name })) });
    },
    readFile: ({ path }: { path: string }) =>
      files.has(path)
        ? Promise.resolve({ data: files.get(path) })
        : Promise.reject(new Error('missing')),
    writeFile: ({ path, data }: { path: string; data: string }) => {
      files.set(path, data);
      return Promise.resolve();
    },
    deleteFile: ({ path }: { path: string }) => {
      files.delete(path);
      return Promise.resolve();
    },
  },
}));
vi.mock('@capacitor/preferences', () => ({ Preferences: {} }));

import { privateSnapshotStore } from '../src/platform/appStores';

describe('privateSnapshotStore', () => {
  beforeEach(() => files.clear());

  it('round-trips files and keeps different keys apart', async () => {
    const a = privateSnapshotStore('content://a');
    const b = privateSnapshotStore('content://b');
    expect(await a.list()).toEqual([]);
    await a.write('x.fountain', 'one');
    await b.write('y.fountain', 'two');
    expect(await a.list()).toEqual(['x.fountain']);
    expect(await a.read('x.fountain')).toBe('one');
    expect(await a.read('nope')).toBeNull();
    await a.remove('x.fountain');
    await a.remove('x.fountain'); // already gone: no error
    expect(await a.list()).toEqual([]);
    expect(await b.list()).toEqual(['y.fountain']);
  });
});
