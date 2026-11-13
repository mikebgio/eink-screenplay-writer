import { hashText, type FileRef, type SidecarStore, type StoragePort } from '../storage/port';

/* Minimal File System Access API typings (not in lib.dom for all TS versions). */
interface FsHandle {
  kind: 'file' | 'directory';
  name: string;
}
interface FsFileHandle extends FsHandle {
  getFile(): Promise<File>;
  isSameEntry(other: FsFileHandle): Promise<boolean>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
}
interface FsDirHandle extends FsHandle {
  values(): AsyncIterable<FsHandle>;
}
interface FsWindow {
  showOpenFilePicker?(o?: object): Promise<FsFileHandle[]>;
  showSaveFilePicker?(o?: object): Promise<FsFileHandle>;
  showDirectoryPicker?(o?: object): Promise<FsDirHandle>;
}

const FOUNTAIN_TYPES = [
  { description: 'Fountain', accept: { 'text/plain': ['.fountain', '.txt'] } },
];

/** File System Access API where available (Chrome), for `npm run dev`. */
export class FsAccessStorage implements StoragePort {
  private handles = new Map<string, FsFileHandle>();
  private dirs = new Map<string, FsDirHandle>();
  private n = 0;
  private win = window as unknown as FsWindow;

  static supported(): boolean {
    return typeof (window as unknown as FsWindow).showOpenFilePicker === 'function';
  }

  /** Reuse the URI of an already-registered handle for the same file, so recents and the
   * journal (both keyed by URI) match it when it is opened again. */
  private async register(h: FsFileHandle, folderUri?: string): Promise<FileRef> {
    let uri: string | undefined;
    for (const [u, known] of this.handles) {
      if (known.name === h.name && (await known.isSameEntry(h))) {
        uri = u;
        break;
      }
    }
    uri ??= `fsa://${++this.n}/${h.name}`;
    this.handles.set(uri, h);
    return { uri, name: h.name, ...(folderUri ? { folderUri } : {}) };
  }
  private async guard<T>(p: Promise<T>): Promise<T | null> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }

  async pickOpen() {
    const hs = await this.guard(this.win.showOpenFilePicker!({ types: FOUNTAIN_TYPES }));
    return hs?.[0] ? this.register(hs[0]) : null;
  }
  async pickCreate(suggestedName: string) {
    const h = await this.guard(
      this.win.showSaveFilePicker!({ suggestedName, types: FOUNTAIN_TYPES }),
    );
    return h ? this.register(h) : null;
  }
  async pickFolder() {
    const d = await this.guard(this.win.showDirectoryPicker!({ mode: 'readwrite' }));
    if (!d) return null;
    const uri = `fsa-dir://${++this.n}/${d.name}`;
    this.dirs.set(uri, d);
    return { uri };
  }
  async listFolder(folderUri: string): Promise<FileRef[]> {
    const dir = this.dirs.get(folderUri);
    if (!dir) return [];
    const out: FileRef[] = [];
    for await (const h of dir.values()) {
      if (h.kind === 'file' && /\.(fountain|txt)$/i.test(h.name)) {
        out.push(await this.register(h as FsFileHandle, folderUri));
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  async read(ref: FileRef) {
    const h = this.handles.get(ref.uri);
    if (!h) throw new Error('File handle expired; reopen the file.');
    const text = await (await h.getFile()).text();
    return { text, version: await hashText(text) };
  }
  async write(ref: FileRef, text: string) {
    const h = this.handles.get(ref.uri);
    if (!h) throw new Error('File handle expired; reopen the file.');
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    return { version: await hashText(text) };
  }
  sidecar(): SidecarStore | null {
    return null;
  }
}

const LS_PREFIX = 'fakefs:';

/** Fallback: a flat fake folder in localStorage, with names chosen via prompt(). */
export class LocalStorageFolder implements StoragePort {
  private names(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length));
    }
    return out.sort();
  }
  private ref(name: string): FileRef {
    return { uri: `ls://${name}`, name, folderUri: 'ls://' };
  }
  pickOpen() {
    const name = window.prompt(`Open which file?\n${this.names().join('\n')}`);
    return Promise.resolve(name && this.names().includes(name) ? this.ref(name) : null);
  }
  pickCreate(suggestedName: string) {
    const name = window.prompt('File name', suggestedName);
    if (!name) return Promise.resolve(null);
    if (localStorage.getItem(LS_PREFIX + name) === null) localStorage.setItem(LS_PREFIX + name, '');
    return Promise.resolve(this.ref(name));
  }
  pickFolder() {
    return Promise.resolve({ uri: 'ls://' });
  }
  listFolder() {
    return Promise.resolve(this.names().map((n) => this.ref(n)));
  }
  async read(ref: FileRef) {
    const text = localStorage.getItem(LS_PREFIX + ref.name);
    if (text === null) throw new Error(`No such file: ${ref.name}`);
    return { text, version: await hashText(text) };
  }
  async write(ref: FileRef, text: string) {
    localStorage.setItem(LS_PREFIX + ref.name, text);
    return { version: await hashText(text) };
  }
  sidecar(): SidecarStore | null {
    return null;
  }
}
