import type { EInkPlugin, RefreshMode } from './eink';

/** Quiet time after the last keystroke before the screen gets a clean full refresh. */
export const IDLE_MS = 1500;

/**
 * When the e-ink screen should redraw how: fast while typing, one full clean refresh after a
 * pause, a page turn, or a dialog/drawer opening or closing. Failures are swallowed: refresh
 * control is cosmetic and must never break typing.
 */
export class RefreshPolicy {
  /** The mode last requested (tracked here so the latency screen can label its samples). */
  mode: RefreshMode = 'normal';
  /** When false, typing never switches to fast (used to compare with fast mode off). */
  enabled = true;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly plugin: EInkPlugin) {}

  keystroke(): void {
    if (!this.enabled) return;
    if (this.mode !== 'fast') this.set('fast');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settle(), IDLE_MS);
  }

  pageTurn(): void {
    this.settle();
  }

  overlayChanged(): void {
    this.settle();
  }

  dispose(): void {
    clearTimeout(this.timer);
  }

  /** Back to normal (if needed) and one full refresh. */
  private settle(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.mode !== 'normal') this.set('normal');
    this.plugin.fullRefresh().catch(() => {});
  }

  private set(mode: RefreshMode): void {
    this.mode = mode;
    this.plugin.setRefreshMode(mode).catch(() => {});
  }
}
