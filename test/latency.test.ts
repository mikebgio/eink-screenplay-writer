import { describe, expect, it } from 'vitest';
import { KeyTimer, LatencyRecorder, MAX_KEY_AGE_MS, percentile } from '../src/platform/latency';

describe('percentile', () => {
  it('median and p95 of 1..100', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(95);
  });
  it('empty gives null; unsorted input is fine', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });
});

describe('LatencyRecorder', () => {
  it('keeps only the last 200 samples per mode', () => {
    const r = new LatencyRecorder();
    for (let i = 0; i < 250; i++) r.add('fast', i);
    r.add('normal', 5);
    const s = r.stats();
    expect(s.fast.count).toBe(200);
    expect(s.fast.median).toBe(149); // samples 50..249
    expect(s.normal).toEqual({ count: 1, median: 5, p95: 5 });
  });
  it('clear empties both modes', () => {
    const r = new LatencyRecorder();
    r.add('fast', 1);
    r.clear();
    expect(r.stats().fast.count).toBe(0);
  });
});

describe('KeyTimer', () => {
  function setup() {
    let t = 0;
    const r = new LatencyRecorder();
    const frames: (() => void)[] = [];
    const k = new KeyTimer(
      r,
      () => 'fast',
      () => t,
      (cb) => void frames.push(cb),
    );
    return { r, k, frames, at: (x: number) => (t = x) };
  }

  it('records keydown to the next frame after the change', () => {
    const { r, k, frames, at } = setup();
    k.keydown();
    at(30);
    k.committed();
    at(50);
    frames.forEach((f) => f());
    expect(r.stats().fast).toEqual({ count: 1, median: 50, p95: 50 });
  });

  it('ignores a change long after a keydown that changed nothing', () => {
    const { r, k, frames, at } = setup();
    k.keydown(); // e.g. Backspace at the start of the document
    at(MAX_KEY_AGE_MS + 5000);
    k.committed(); // a later paste or programmatic edit
    frames.forEach((f) => f());
    expect(r.stats().fast.count).toBe(0);
  });

  it('ignores a change with no keydown', () => {
    const { r, k, frames } = setup();
    k.committed();
    frames.forEach((f) => f());
    expect(r.stats().fast.count).toBe(0);
  });
});
