import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor Android shell (false in a desktop browser). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
