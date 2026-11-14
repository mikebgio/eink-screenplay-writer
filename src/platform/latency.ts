/** Browser-side keypress-to-render delay statistics for the debug screen. */

const WINDOW = 200;

/** Nearest-rank percentile (0-100) of unsorted values; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? null;
}

export interface Stats {
  count: number;
  median: number | null;
  p95: number | null;
}

export type SampleMode = 'fast' | 'normal';

export class LatencyRecorder {
  private samples: Record<SampleMode, number[]> = { fast: [], normal: [] };

  add(mode: SampleMode, ms: number): void {
    const list = this.samples[mode];
    list.push(ms);
    if (list.length > WINDOW) list.shift();
  }

  clear(): void {
    this.samples = { fast: [], normal: [] };
  }

  stats(): Record<SampleMode, Stats> {
    const of = (m: SampleMode): Stats => ({
      count: this.samples[m].length,
      median: percentile(this.samples[m], 50),
      p95: percentile(this.samples[m], 95),
    });
    return { fast: of('fast'), normal: of('normal') };
  }
}

/**
 * Times keydown -> the next animation frame after the editor text changed. Call `keydown()` for
 * each key press and `committed()` when the editor reports a change.
 */
export class KeyTimer {
  private pending: number | null = null;
  constructor(
    private readonly recorder: LatencyRecorder,
    private readonly mode: () => SampleMode,
    private readonly now: () => number = () => performance.now(),
    private readonly raf: (cb: () => void) => void = (cb) => void requestAnimationFrame(cb),
  ) {}

  keydown(): void {
    this.pending = this.now();
  }

  committed(): void {
    const start = this.pending;
    if (start === null) return;
    this.pending = null;
    const mode = this.mode();
    this.raf(() => this.recorder.add(mode, this.now() - start));
  }
}
