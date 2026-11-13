import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { StoragePort } from '../storage/port';
import { FsAccessStorage, LocalStorageFolder } from './browserStorage';
import { NativeStorage } from './nativeStorage';

export { FilesystemJournal, preferencesStore, privateSnapshotStore } from './appStores';

/** True when running inside the Capacitor Android shell (false in a desktop browser). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Native plugin on Android; File System Access API in Chrome; localStorage otherwise. */
export function createStorage(): StoragePort {
  if (isNative()) return new NativeStorage();
  return FsAccessStorage.supported() ? new FsAccessStorage() : new LocalStorageFolder();
}

/** Calls `cb` when the app goes to the background (Capacitor `pause`, or tab hidden on web). */
export function onBackground(cb: () => void): () => void {
  if (isNative()) {
    const h = App.addListener('pause', cb);
    return () => void h.then((x) => x.remove());
  }
  const fn = () => {
    if (document.visibilityState === 'hidden') cb();
  };
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
}
