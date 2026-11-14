import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshPolicy, IDLE_MS } from '../src/platform/refreshPolicy';
import { browserEInk, type EInkPlugin } from '../src/platform/eink';

function fakePlugin() {
  const calls: string[] = [];
  const plugin: EInkPlugin = {
    setRefreshMode: async (m) => void calls.push(`mode:${m}`),
    fullRefresh: async () => void calls.push('full'),
    isEInk: async () => ({ value: true }),
  };
  return { plugin, calls };
}

describe('RefreshPolicy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('switches to fast on the first keystroke only', () => {
    const { plugin, calls } = fakePlugin();
    const p = new RefreshPolicy(plugin);
    p.keystroke();
    p.keystroke();
    expect(calls).toEqual(['mode:fast']);
    expect(p.mode).toBe('fast');
  });

  it('does a full refresh and returns to normal after 1500 ms idle', () => {
    const { plugin, calls } = fakePlugin();
    const p = new RefreshPolicy(plugin);
    p.keystroke();
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(calls).toEqual(['mode:fast']);
    vi.advanceTimersByTime(1);
    expect(calls).toContain('full');
    expect(calls).toContain('mode:normal');
    expect(p.mode).toBe('normal');
  });

  it('each keystroke restarts the idle timer', () => {
    const { plugin, calls } = fakePlugin();
    const p = new RefreshPolicy(plugin);
    p.keystroke();
    vi.advanceTimersByTime(1000);
    p.keystroke();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['mode:fast']);
    vi.advanceTimersByTime(500);
    expect(calls).toContain('full');
  });

  it('full-refreshes on a page turn or a dialog change, and leaves fast mode', () => {
    const { plugin, calls } = fakePlugin();
    const p = new RefreshPolicy(plugin);
    p.pageTurn();
    expect(calls).toEqual(['full']);
    p.keystroke();
    p.overlayChanged();
    expect(calls.slice(1)).toEqual(['mode:fast', 'mode:normal', 'full']);
    vi.advanceTimersByTime(IDLE_MS * 2);
    expect(calls).toHaveLength(4); // the idle timer was cancelled
  });

  it('never goes fast when disabled', () => {
    const { plugin, calls } = fakePlugin();
    const p = new RefreshPolicy(plugin);
    p.enabled = false;
    p.keystroke();
    vi.advanceTimersByTime(IDLE_MS);
    expect(calls).toEqual([]);
    expect(p.mode).toBe('normal');
  });

  it('survives a plugin that rejects', async () => {
    const plugin: EInkPlugin = {
      setRefreshMode: () => Promise.reject(new Error('boom')),
      fullRefresh: () => Promise.reject(new Error('boom')),
      isEInk: async () => ({ value: false }),
    };
    const p = new RefreshPolicy(plugin);
    p.keystroke();
    p.pageTurn();
    await vi.runAllTimersAsync();
    expect(p.mode).toBe('normal');
  });
});

describe('browser fallback', () => {
  it('resolves every call and reports not e-ink', async () => {
    await expect(browserEInk.setRefreshMode('fast')).resolves.toBeUndefined();
    await expect(browserEInk.setRefreshMode('normal')).resolves.toBeUndefined();
    await expect(browserEInk.fullRefresh()).resolves.toBeUndefined();
    await expect(browserEInk.isEInk()).resolves.toEqual({ value: false });
  });
});
