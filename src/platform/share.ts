import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadBytes } from './browserStorage';
import { isCancel } from './isCancel';
import { toBase64 } from '../storage/bytes';

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Shared files live here, and only here, in the app cache. */
const SHARE_DIR = 'exports';

/**
 * Hands an exported file to the Android share sheet: it is written to the app cache first, because
 * the sheet takes a file URI. Where there is no share sheet (a desktop browser), the file is
 * downloaded instead.
 *
 * The file is not deleted when the sheet closes, because the receiving app may still be reading it.
 * Instead the previous export is cleared before the next one is written, so at most one stays on disk.
 */
export async function shareFile(name: string, bytes: Uint8Array, mime: string): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.rmdir({ path: SHARE_DIR, directory: Directory.Cache, recursive: true }).catch(
      () => undefined, // nothing shared yet
    );
    const { uri } = await Filesystem.writeFile({
      path: `${SHARE_DIR}/${name}`,
      directory: Directory.Cache,
      data: toBase64(bytes),
      recursive: true,
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
