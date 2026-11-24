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
  /** The file type for the picker follows the extension of `suggestedName` (`.fountain`, `.pdf`, `.fdx`). */
  pickCreate(suggestedName: string): Promise<FileRef | null>;
  pickFolder(): Promise<{ uri: string } | null>;
  listFolder(folderUri: string): Promise<FileRef[]>;
  /** A new empty file in a workspace folder. The caller picks a name that isn't taken (ticket 12). */
  createInFolder(folderUri: string, name: string): Promise<FileRef>;
  read(ref: FileRef): Promise<{ text: string; version: string }>;
  write(ref: FileRef, text: string): Promise<{ version: string }>;
  /** Writes binary data (an exported PDF) to a file the writer just created with `pickCreate`. */
  writeBytes(ref: FileRef, bytes: Uint8Array): Promise<void>;
  sidecar(ref: FileRef): SidecarStore | null;
}

/** SHA-256 hex of UTF-8 text, via crypto.subtle. */
export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous 64-bit FNV-1a hash as hex. Not collision-resistant: use it only where a clash is
 * harmless (MemoryStorage versions, disambiguating short folder names), never to decide that two
 * texts are equal. crypto.subtle can't be flushed by fake timers, so tests need this one.
 */
export function syncHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  }
  return h.toString(16).padStart(16, '0');
}

/** MIME type for a file name's extension, used by pickers and the share sheet. */
export function mimeForName(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'fdx') return 'application/xml';
  return 'text/plain';
}
