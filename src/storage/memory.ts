import { hashText, type FileRef, type SidecarStore, type StoragePort } from './port';

/** In-memory StoragePort for tests. Pickers return whatever the test queued up. */
export class MemoryStorage implements StoragePort {
  readonly files = new Map<string, string>();
  readonly sidecars = new Map<string, Map<string, string>>();
  /** Queued results for the next pick* calls (null = user cancelled). */
  nextOpen: FileRef | null = null;
  nextCreate: FileRef | null = null;
  nextFolder: { uri: string } | null = null;
  writeCount = 0;

  /** Create or replace a file as if it already existed on disk. */
  seed(uri: string, text: string, folderUri?: string): FileRef {
    this.files.set(uri, text);
    return { uri, name: uri.split('/').pop() ?? uri, ...(folderUri ? { folderUri } : {}) };
  }

  /** Simulate another device editing the file. */
  simulateExternalEdit(uri: string, text: string): void {
    this.files.set(uri, text);
  }

  pickOpen() {
    return Promise.resolve(this.nextOpen);
  }
  pickCreate(suggestedName: string) {
    if (!this.nextCreate) return Promise.resolve(null);
    const ref = this.nextCreate.name
      ? this.nextCreate
      : { ...this.nextCreate, name: suggestedName };
    if (!this.files.has(ref.uri)) this.files.set(ref.uri, '');
    return Promise.resolve(ref);
  }
  pickFolder() {
    return Promise.resolve(this.nextFolder);
  }
  listFolder(folderUri: string): Promise<FileRef[]> {
    const prefix = folderUri.endsWith('/') ? folderUri : `${folderUri}/`;
    return Promise.resolve(
      [...this.files.keys()]
        .filter((u) => u.startsWith(prefix) && !u.slice(prefix.length).includes('/'))
        .map((uri) => ({ uri, name: uri.slice(prefix.length), folderUri })),
    );
  }
  async read(ref: FileRef) {
    const text = this.files.get(ref.uri);
    if (text === undefined) throw new Error(`No such file: ${ref.uri}`);
    return { text, version: await hashText(text) };
  }
  async write(ref: FileRef, text: string) {
    this.files.set(ref.uri, text);
    this.writeCount++;
    return { version: await hashText(text) };
  }
  sidecar(ref: FileRef): SidecarStore | null {
    if (!ref.folderUri) return null;
    const key = ref.folderUri;
    const store = () => {
      let m = this.sidecars.get(key);
      if (!m) this.sidecars.set(key, (m = new Map()));
      return m;
    };
    return {
      list: () => Promise.resolve([...store().keys()]),
      read: (n) => Promise.resolve(store().get(n) ?? null),
      write: (n, t) => {
        store().set(n, t);
        return Promise.resolve();
      },
      remove: (n) => {
        store().delete(n);
        return Promise.resolve();
      },
    };
  }
}
