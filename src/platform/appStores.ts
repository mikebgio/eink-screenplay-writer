import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { hashText, type SidecarStore } from '../storage/port';
import type { JournalEntry, JournalStore } from '../storage/journal';
import type { KeyValueStore } from '../storage/recent';

/** Crash journal in app-private storage (Capacitor Filesystem, Directory.Data). */
export class FilesystemJournal implements JournalStore {
  private async path(key: string) {
    return `journal-${await hashText(key)}.json`;
  }
  async get(key: string): Promise<JournalEntry | null> {
    try {
      const r = await Filesystem.readFile({
        path: await this.path(key),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return JSON.parse(String(r.data)) as JournalEntry;
    } catch {
      return null;
    }
  }
  async set(key: string, entry: JournalEntry) {
    await Filesystem.writeFile({
      path: await this.path(key),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(entry),
    });
  }
  async remove(key: string) {
    try {
      await Filesystem.deleteFile({ path: await this.path(key), directory: Directory.Data });
    } catch {
      /* already gone */
    }
  }
}

/** Capacitor Preferences as a string key-value store (localStorage on the web). */
export const preferencesStore: KeyValueStore = {
  async get(key) {
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    await Preferences.set({ key, value });
  },
};

/** Snapshots for a file with no folder access: plain files in app-private storage (Directory.Data). */
export function privateSnapshotStore(key: string): SidecarStore {
  let dir: Promise<string> | undefined;
  const base = () => (dir ??= hashText(key).then((h) => `snapshots-${h.slice(0, 32)}`));
  const opts = async (name?: string) => ({
    path: name ? `${await base()}/${name}` : await base(),
    directory: Directory.Data,
  });
  return {
    async list() {
      try {
        return (await Filesystem.readdir(await opts())).files.map((f) => f.name);
      } catch {
        return [];
      }
    },
    async read(name) {
      try {
        const r = await Filesystem.readFile({ ...(await opts(name)), encoding: Encoding.UTF8 });
        return String(r.data);
      } catch {
        return null;
      }
    },
    async write(name, text) {
      await Filesystem.writeFile({
        ...(await opts(name)),
        encoding: Encoding.UTF8,
        data: text,
        recursive: true,
      });
    },
    async remove(name) {
      try {
        await Filesystem.deleteFile(await opts(name));
      } catch {
        /* already gone */
      }
    },
  };
}
