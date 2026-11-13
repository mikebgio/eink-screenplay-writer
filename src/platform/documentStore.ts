import { registerPlugin } from '@capacitor/core';

/** Thin bridge to the local Kotlin `DocumentStore` plugin (Android SAF). No business logic. */
export interface DocumentStorePlugin {
  pickOpen(): Promise<{ uri?: string; name?: string }>;
  pickCreate(o: { suggestedName: string }): Promise<{ uri?: string; name?: string }>;
  pickFolder(): Promise<{ uri?: string }>;
  listFolder(o: { folderUri: string }): Promise<{ files: { uri: string; name: string }[] }>;
  read(o: { uri: string }): Promise<{ text: string }>;
  write(o: { uri: string; text: string }): Promise<void>;
  /** Sidecar files live in a `.<name>.sidecar`-style child directory of the picked folder. */
  sidecarList(o: { folderUri: string }): Promise<{ names: string[] }>;
  sidecarRead(o: { folderUri: string; name: string }): Promise<{ text: string | null }>;
  sidecarWrite(o: { folderUri: string; name: string; text: string }): Promise<void>;
  sidecarRemove(o: { folderUri: string; name: string }): Promise<void>;
}

export const DocumentStore = registerPlugin<DocumentStorePlugin>('DocumentStore');
