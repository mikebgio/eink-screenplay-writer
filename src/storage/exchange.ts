/**
 * Exchange formats on the storage side (ticket 10): turning a script's text into an FDX or a Fountain
 * file, and converting an opened `.fdx` into a new `.fountain`. No Capacitor or DOM imports; everything
 * goes through the storage port, so it is tested with `MemoryStorage`.
 *
 * The export dialog's `FDX_FORMAT` and `FOUNTAIN_FORMAT` (`src/ui/exportFormats.ts`) call
 * `exportFdxText` and `exportFountainText`; the dialog does the saving.
 */
import { exportFdx, importFdx, parse, resolve, toFountain } from '../engine';
import type { FileRef, StoragePort } from './port';

export const isFdxName = (name: string): boolean => /\.fdx$/i.test(name);

/** `Script.fdx` → `Script.fountain` (and back). A name with no extension just gets one. */
export function exchangeFileName(scriptName: string, extension: 'fdx' | 'fountain'): string {
  const base = scriptName.replace(/\.(fountain|txt|fdx)$/i, '').trim() || 'Script';
  return `${base}.${extension}`;
}

export interface FdxExportOptions {
  /** Write a `Number` on every scene heading. */
  sceneNumbers?: boolean;
  /** `fill` (default) prints values; `keep` leaves `{{KEY}}` in the file. */
  variables?: 'fill' | 'keep';
}

/** Final Draft XML for a script's text. Values are filled in unless `variables` is `keep` (`{{KEY}}` stays). */
export function exportFdxText(text: string, opts: FdxExportOptions = {}): string {
  const { doc } = resolve(parse(text), { mode: opts.variables === 'keep' ? 'keep' : 'resolve' });
  return exportFdx(doc, { sceneNumbers: opts.sceneNumbers });
}

/**
 * A `.fountain` copy of a script: values filled in and no `Var-` lines or `{{` unless `variables` is
 * `keep`, which writes the script as it is.
 */
export function exportFountainText(
  text: string,
  opts: { variables?: 'fill' | 'keep' } = {},
): string {
  return toFountain(parse(text), { dropVariables: opts.variables !== 'keep' });
}

/**
 * Converts an `.fdx` file into a new `.fountain` file the writer chooses a place for, and returns it
 * (null if they cancel). The conversion runs first, so a file that isn't Final Draft XML fails before a
 * save picker is shown and nothing is created. The `.fdx` itself is never changed.
 */
export async function importFdxFile(
  storage: StoragePort,
  source: FileRef,
): Promise<FileRef | null> {
  const { text } = await storage.read(source);
  const fountain = importFdx(text.replace(/^\uFEFF/, ''));
  const target = await storage.pickCreate(exchangeFileName(source.name, 'fountain'));
  if (!target) return null;
  await storage.write(target, fountain);
  return target;
}
