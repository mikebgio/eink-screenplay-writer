import { hashText, type FileRef, type SidecarStore, type StoragePort } from '../storage/port';
import { DocumentStore } from './documentStore';
import { snapshotDirName } from '../storage/snapshots';

/** StoragePort over the Android DocumentStore plugin. */
export class NativeStorage implements StoragePort {
  async pickOpen(): Promise<FileRef | null> {
    const r = await DocumentStore.pickOpen();
    return r.uri ? { uri: r.uri, name: r.name ?? r.uri } : null;
  }
  async pickCreate(suggestedName: string): Promise<FileRef | null> {
    const r = await DocumentStore.pickCreate({ suggestedName });
    return r.uri ? { uri: r.uri, name: r.name ?? suggestedName } : null;
  }
  async pickFolder() {
    const r = await DocumentStore.pickFolder();
    return r.uri ? { uri: r.uri } : null;
  }
  async listFolder(folderUri: string): Promise<FileRef[]> {
    const { files } = await DocumentStore.listFolder({ folderUri });
    return files
      .filter((f) => /\.(fountain|txt)$/i.test(f.name))
      .map((f) => ({ ...f, folderUri }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async read(ref: FileRef) {
    const { text } = await DocumentStore.read({ uri: ref.uri });
    return { text, version: await hashText(text) };
  }
  async write(ref: FileRef, text: string) {
    await DocumentStore.write({ uri: ref.uri, text });
    return { version: await hashText(text) };
  }
  sidecar(ref: FileRef): SidecarStore | null {
    const folderUri = ref.folderUri;
    if (!folderUri) return null;
    const dir = snapshotDirName(ref.name);
    return {
      list: async () => (await DocumentStore.sidecarList({ folderUri, dir })).names,
      // Java drops a null JSObject value, so a missing file arrives as undefined.
      read: async (name) =>
        (await DocumentStore.sidecarRead({ folderUri, dir, name })).text ?? null,
      write: (name, text) => DocumentStore.sidecarWrite({ folderUri, dir, name, text }),
      remove: (name) => DocumentStore.sidecarRemove({ folderUri, dir, name }),
    };
  }
}
