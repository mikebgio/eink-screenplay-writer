import type { FileRef, StoragePort } from './port';

/** An export's contents: bytes (PDF) or text (FDX, Fountain). */
export type ExportData = Uint8Array | string;

export function exportBytes(data: ExportData): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

/** A file name without the characters file systems reject (`/ \ : * ? " < > |` and control characters). */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** `yyyy-mm-dd` in the writer's local time. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `<title> – <yyyy-mm-dd>.<extension>`; a blank title falls back to "Script". */
export function suggestedExportName(title: string, now: Date, extension: string): string {
  const base = sanitizeFileName(title.replace(/\s+/g, ' ')) || 'Script';
  return `${base} – ${isoDate(now)}.${extension}`;
}

/** Asks for a file with the storage port's picker and writes the export to it; null if cancelled. */
export async function saveExport(
  storage: StoragePort,
  suggestedName: string,
  data: ExportData,
): Promise<FileRef | null> {
  const ref = await storage.pickCreate(suggestedName);
  if (!ref) return null;
  await storage.writeBytes(ref, exportBytes(data));
  return ref;
}
