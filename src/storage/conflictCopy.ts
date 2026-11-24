/** "Keep both" (ticket 12): where the writer's version of a conflicted script goes. */
import { isoDate, sanitizeFileName } from './exportFile';
import type { FileRef, StoragePort } from './port';

/** `<name> (conflict <yyyy-mm-dd hh-mm>).fountain`, in the writer's local time. */
export function conflictCopyName(scriptName: string, now: Date): string {
  const base = sanitizeFileName(scriptName.replace(/\.(fountain|txt)$/i, '')) || 'Script';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${base} (conflict ${isoDate(now)} ${p(now.getHours())}-${p(now.getMinutes())}).fountain`;
}

/**
 * A new file for the copy: next to the original in workspace-folder mode (numbered if the name is
 * taken), otherwise wherever the writer chooses. Null when they cancel the picker.
 * `originalText` is what the original holds, to put back if the picker emptied it.
 */
export async function createConflictCopy(
  storage: StoragePort,
  original: FileRef,
  now: Date,
  originalText: string,
): Promise<FileRef | null> {
  const name = conflictCopyName(original.name, now);
  if (!original.folderUri) {
    const picked = await storage.pickCreate(name);
    if (picked?.uri === original.uri) {
      // Desktop Chrome's save picker can clear an existing file as soon as it is chosen. Only an
      // empty file is written: anything else there is left as it is.
      if ((await storage.read(original)).text === '') await storage.write(original, originalText);
      throw new Error('Choose a different file: the copy cannot replace the original.');
    }
    return picked;
  }
  const taken = new Set((await storage.listFolder(original.folderUri)).map((f) => f.name));
  const stem = name.slice(0, -'.fountain'.length);
  let free = name;
  for (let n = 2; taken.has(free); n++) free = `${stem} ${n}.fountain`;
  return storage.createInFolder(original.folderUri, free);
}
