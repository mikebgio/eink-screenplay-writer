/**
 * Exchange formats on the storage side (ticket 10): turning a script's text into an FDX or a clean
 * Fountain file, saving it, and converting an opened `.fdx` into a new `.fountain`. No Capacitor or DOM
 * imports; everything goes through the storage port, so it is tested with `MemoryStorage`.
 *
 * Ticket 09's export dialog calls `exportFdxText` and `exportFountainText` from its format entries and
 * does its own saving; `saveTextExport` is what the interim menu (`src/ui/ExchangeMenu.tsx`) uses.
 */
import { exportFdx, importFdx, parse, resolve, toFountain } from '../engine';
import type { FileRef, StoragePort } from './port';

export const isFdxName = (name: string): boolean => /\.fdx$/i.test(name);

/**
 * `Script.fountain` → `Script.fdx`. A name with no extension just gets one. `filled` marks the
 * Fountain copy that has its variables filled in, so it isn't mistaken for the working file.
 */
export function exchangeFileName(
  scriptName: string,
  extension: 'fdx' | 'fountain',
  opts: { filled?: boolean } = {},
): string {
  const base = scriptName.replace(/\.(fountain|txt|fdx)$/i, '').trim() || 'Script';
  return `${base}${opts.filled ? ' (values filled in)' : ''}.${extension}`;
}

export interface FdxExportOptions {
  /** Write a `Number` on every scene heading. */
  sceneNumbers?: boolean;
  /** `fill` (default) prints values; `keep` leaves `{{KEY}}` in the file. */
  variables?: 'fill' | 'keep';
}

/** Final Draft XML for the script as written (variables unresolved). */
export function exportFdxText(text: string, opts: FdxExportOptions = {}): string {
  const { doc } = resolve(parse(text), { mode: opts.variables === 'keep' ? 'keep' : 'resolve' });
  return exportFdx(doc, { sceneNumbers: opts.sceneNumbers });
}

/** A clean `.fountain` copy: values filled in, no `Var-` lines and no `{{`. */
export function exportFountainText(text: string): string {
  return toFountain(parse(text), { dropVariables: true });
}

/** Asks where to save and writes `text` there; null if the writer cancels. */
export async function saveTextExport(
  storage: StoragePort,
  suggestedName: string,
  text: string,
): Promise<FileRef | null> {
  const ref = await storage.pickCreate(suggestedName);
  if (!ref) return null;
  await storage.write(ref, text);
  return ref;
}

/**
 * Converts an `.fdx` file into a new `.fountain` file the writer chooses a place for, and returns it
 * (null if they cancel). The conversion runs first, so a file that isn't Final Draft XML fails before a
 * save picker is shown and nothing is created. The `.fdx` itself is never changed.
 */
export async function importFdxFile(storage: StoragePort, source: FileRef): Promise<FileRef | null> {
  const { text } = await storage.read(source);
  const fountain = importFdx(text.replace(/^\uFEFF/, ''));
  const target = await storage.pickCreate(exchangeFileName(source.name, 'fountain'));
  if (!target) return null;
  await storage.write(target, fountain);
  return target;
}
