import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadBytes } from './browserStorage';
import { toBase64 } from '../storage/bytes';

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

const isCancel = (e: unknown) =>
  (e instanceof DOMException && e.name === 'AbortError') ||
  /cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Hands an exported file to the Android share sheet: it is written to the app cache first, because
 * the sheet takes a file URI. Where there is no share sheet (a desktop browser), the file is
 * downloaded instead.
 */
export async function shareFile(name: string, bytes: Uint8Array, mime: string): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: name,
      directory: Directory.Cache,
      data: toBase64(bytes),
    });
    try {
      await Share.share({ title: name, files: [uri] });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      throw e;
    }
  }
  const file = new File([bytes.slice()], name, { type: mime });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      // The browser refused (no user gesture, blocked): fall through to a download.
    }
  }
  downloadBytes(name, bytes, mime);
  return 'downloaded';
}
