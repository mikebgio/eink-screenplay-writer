import { registerPlugin } from '@capacitor/core';

export type RefreshMode = 'fast' | 'normal' | 'full';

/** Bridge to the local Kotlin `EInk` plugin (Onyx EPD SDK). No policy here; see refreshPolicy.ts. */
export interface EInkPlugin {
  setRefreshMode(mode: RefreshMode): Promise<void>;
  /** One clean redraw of the whole screen, to clear ghosting. */
  fullRefresh(): Promise<void>;
  isEInk(): Promise<{ value: boolean }>;
}

/** What every call does in a browser (or on a non-Onyx device): nothing. */
export const browserEInk: EInkPlugin = {
  setRefreshMode: () => Promise.resolve(),
  fullRefresh: () => Promise.resolve(),
  isEInk: () => Promise.resolve({ value: false }),
};

// `web` makes Capacitor use the no-op fallback when there is no native implementation.
export const EInk = registerPlugin<EInkPlugin>('EInk', { web: () => Promise.resolve(browserEInk) });
