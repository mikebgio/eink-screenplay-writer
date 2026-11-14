import { registerPlugin, WebPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

/** Bridge to the local Java `Device` plugin (hardware keyboard state). */
export interface DevicePlugin {
  /** True while a hardware (e.g. Bluetooth) keyboard is connected. */
  hasHardwareKeyboard(): Promise<{ value: boolean }>;
  addListener(
    event: 'keyboardChange',
    cb: (e: { value: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

/** In a browser there is no on-screen keyboard to hide. */
class DeviceWeb extends WebPlugin implements Pick<DevicePlugin, 'hasHardwareKeyboard'> {
  async hasHardwareKeyboard() {
    return { value: false };
  }
}

export const Device = registerPlugin<DevicePlugin>('Device', { web: () => new DeviceWeb() });

/** Calls `cb` now and whenever a hardware keyboard is connected or disconnected. Returns an unsubscribe. */
export function watchHardwareKeyboard(cb: (connected: boolean) => void): () => void {
  let live = true;
  void Device.hasHardwareKeyboard().then(
    (r) => live && cb(r.value),
    () => {},
  );
  const handle = Device.addListener('keyboardChange', (e) => live && cb(e.value)).catch(() => null);
  return () => {
    live = false;
    void handle.then((h) => h?.remove());
  };
}
