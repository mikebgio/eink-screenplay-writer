import { describe, expect, it } from 'vitest';
import { LatencyRecorder, percentile } from '../src/platform/latency';

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
