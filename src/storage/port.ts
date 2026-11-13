/** Storage port (ticket 04). No Capacitor or DOM imports here: backends implement it. */

export interface FileRef {
  uri: string;
  name: string;
  folderUri?: string;
}

/** Version is a SHA-256 of the file contents (Decision D2), not a modified time. */
export interface Stat {
  version: string;
}

/** Sidecar files (snapshots, ticket 11). Only available when the file's folder is known. */
export interface SidecarStore {
  list(): Promise<string[]>;
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface StoragePort {
  pickOpen(): Promise<FileRef | null>;
  pickCreate(suggestedName: string): Promise<FileRef | null>;
  pickFolder(): Promise<{ uri: string } | null>;
  listFolder(folderUri: string): Promise<FileRef[]>;
  read(ref: FileRef): Promise<{ text: string; version: string }>;
  write(ref: FileRef, text: string): Promise<{ version: string }>;
  sidecar(ref: FileRef): SidecarStore | null;
}

/** SHA-256 hex of UTF-8 text, via crypto.subtle. */
export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous content hash (FNV-1a, 64-bit as hex). The fake must resolve without real I/O:
 * crypto.subtle completes on a thread pool, which fake timers can't flush, so tests raced it.
 */
export function syncHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  }
  return h.toString(16).padStart(16, '0');
}
