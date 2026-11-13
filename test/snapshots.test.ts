import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLAPSE_OVER, diff, diffRows, diffStats } from '../src/engine';
import { MemoryStorage } from '../src/storage/memory';
import type { SidecarStore } from '../src/storage/port';
import {
  AUTO_INTERVAL_MS,
  SnapshotService,
  parseSnapshotName,
  selectPrunable,
  snapshotDirName,
  snapshotFileName,
  splitLabel,
  withLabel,
  type Snapshot,
} from '../src/storage/snapshots';

function memStore(): SidecarStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    list: () => Promise.resolve([...m.keys()]),
    read: (n) => Promise.resolve(m.get(n) ?? null),
    write: (n, t) => {
      m.set(n, t);
      return Promise.resolve();
    },
    remove: (n) => {
      m.delete(n);
      return Promise.resolve();
    },
  };
}

describe('SnapshotService', () => {
  let storage: MemoryStorage;
  let svc: SnapshotService;
  let current: string;
  const privateStores = new Map<string, ReturnType<typeof memStore>>();
  const folder = (text: string) => {
    const ref = storage.seed('mem://f/the-long-night.fountain', text, 'mem://f');
    return ref;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T21:30:05Z'));
    storage = new MemoryStorage();
    privateStores.clear();
    svc = new SnapshotService({
      storage,
      privateStore: (k) => {
        const s = memStore();
        privateStores.set(k, s);
        return s;
      },
    });
    current = 'INT. ROOM - DAY';
  });
  afterEach(() => {
    svc.detach();
    vi.useRealTimers();
  });

  const names = () => [...(storage.sidecars.values().next().value?.keys() ?? [])];

  it('writes a named snapshot with the label, in a hidden sidecar folder', async () => {
    const ref = folder(current);
    await svc.attach(ref, current, () => current);
    const s = await svc.take('changed', 'named', 'Before Act 3 rewrite!');
    expect(s?.name).toBe('2026-11-12T21-30-05Z--named--before-act-3-rewrite.fountain');
    expect(storage.sidecars.has('mem://f/.the-long-night.snapshots')).toBe(true);
    const entry = (await svc.entries()).find((e) => e.kind === 'named');
    expect(entry?.label).toBe('Before Act 3 rewrite!');
    expect(await svc.read(entry!)).toBe('changed');
  });

  it('takes an auto snapshot on open only when the text differs from the latest', async () => {
    const ref = folder(current);
    await svc.attach(ref, current, () => current);
    expect(names()).toHaveLength(1);
    svc.detach();
    vi.setSystemTime(new Date('2026-11-12T22:00:00Z'));
    await svc.attach(ref, current, () => current);
    expect(names()).toHaveLength(1);
    svc.detach();
    await svc.attach(ref, 'edited elsewhere', () => 'edited elsewhere');
    expect(names()).toHaveLength(2);
  });

  it('takes an auto snapshot every 10 minutes, only if the text changed', async () => {
    await svc.attach(folder(current), current, () => current);
    await vi.advanceTimersByTimeAsync(AUTO_INTERVAL_MS);
    expect(names()).toHaveLength(1);
    current = 'INT. ROOM - NIGHT';
    await vi.advanceTimersByTimeAsync(AUTO_INTERVAL_MS);
    expect(names()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(AUTO_INTERVAL_MS);
    expect(names()).toHaveLength(2);
  });

  it('never writes two identical snapshots in a row', async () => {
    await svc.attach(folder(current), current, () => current);
    expect(await svc.take(current, 'auto')).toBeNull();
    expect(await svc.take(current, 'pre-conflict')).toBeNull();
    expect(names()).toHaveLength(1);
  });

  it('restore writes a pre-restore snapshot first, then returns the old text', async () => {
    await svc.attach(folder(current), current, () => current);
    vi.setSystemTime(new Date('2026-11-12T21:40:00Z'));
    const old = (await svc.list())[0]!;
    const restored = await svc.restore(old, 'my newer draft');
    expect(restored).toBe(current);
    const pre = (await svc.entries()).find((e) => e.kind === 'pre-restore')!;
    expect(await svc.read(pre)).toBe('my newer draft');
  });

  it('uses app-private storage in single-file mode', async () => {
    const ref = storage.seed('mem://solo/draft.fountain', current); // no folderUri
    await svc.attach(ref, current, () => current);
    expect(svc.deviceOnly).toBe(true);
    expect(storage.sidecars.size).toBe(0);
    expect(privateStores.get('mem://solo/draft.fountain')?.m.size).toBe(1);
  });

  it('only named snapshots can be deleted', async () => {
    await svc.attach(folder(current), current, () => current);
    const auto = (await svc.list())[0]!;
    await expect(svc.remove(auto)).rejects.toThrow();
    const named = (await svc.take('x', 'named', 'x'))!;
    await svc.remove(named);
    expect(await svc.list()).toHaveLength(1);
  });
});

describe('snapshot label header', () => {
  it('does not mistake a script that starts with the marker for a label', () => {
    const text = '[[snapshot: fake]]\nINT. ROOM';
    expect(splitLabel(withLabel(text))).toEqual({ text });
    expect(splitLabel(withLabel(text, 'Real'))).toEqual({ label: 'Real', text });
  });
  it('sanitises the sidecar folder name', () => {
    expect(snapshotDirName('../../x/y.fountain')).not.toMatch(/[/]|\.\./);
  });
});

describe('snapshot file names', () => {
  it('sort chronologically and round-trip through the parser', () => {
    const times = [
      Date.UTC(2026, 0, 2, 3, 4, 5),
      Date.UTC(2025, 11, 31, 23, 59, 59),
      Date.UTC(2026, 10, 12, 21, 41),
    ];
    const names = times.map((t, i) =>
      snapshotFileName(t, i === 2 ? 'named' : 'auto', i === 2 ? 'Act 3!' : undefined),
    );
    const sorted = [...names].sort();
    expect(sorted.map((n) => parseSnapshotName(n)!.time)).toEqual([...times].sort((a, b) => a - b));
    for (const n of names)
      expect(
        snapshotFileName(
          parseSnapshotName(n)!.time,
          parseSnapshotName(n)!.kind,
          parseSnapshotName(n)!.slug,
        ),
      ).toBe(n);
    expect(parseSnapshotName('notes.txt')).toBeNull();
  });
  it('derives the sidecar folder from the script name', () => {
    expect(snapshotDirName('the-long-night.fountain')).toBe('.the-long-night.snapshots');
  });
});

describe('selectPrunable', () => {
  const now = Date.UTC(2026, 10, 30, 12, 0, 0);
  const H = 3600_000;
  const D = 24 * H;
  const snap = (age: number, kind: Snapshot['kind'] = 'auto'): Snapshot => {
    const time = now - age;
    return { name: snapshotFileName(time, kind), time, kind };
  };
  const pruned = (xs: Snapshot[]) => selectPrunable(xs, now).map((s) => s.time);

  it('keeps everything from the last 24 h, including exactly 24 h', () => {
    expect(pruned([snap(0), snap(1000), snap(30 * 60_000), snap(24 * H)])).toEqual([]);
  });
  it('keeps the newest per hour for 7 days, boundary at 7 d', () => {
    const a = snap(25 * H + 5 * 60_000);
    const b = snap(25 * H + 40 * 60_000); // same hour bucket, older
    const c = snap(30 * H);
    expect(pruned([a, b, c])).toEqual([b.time]);
    // exactly 7 d is still hourly; just past 7 d it is in the daily tier (a different bucket)
    expect(pruned([snap(7 * D), snap(7 * D + 1000)])).toEqual([]);
    // two inside the same hour at 7 d: older one goes
    expect(pruned([snap(7 * D - 10 * 60_000), snap(7 * D - 20 * 60_000)])).toEqual([
      now - (7 * D - 10 * 60_000),
    ]);
  });
  it('keeps the newest per day for 30 days, boundary at 30 d', () => {
    const a = snap(8 * D);
    const b = snap(8 * D + H); // same day-ish bucket, older (unless day edge)
    const sameDay = Math.floor(a.time / D) === Math.floor(b.time / D);
    expect(pruned([a, b])).toEqual(sameDay ? [b.time] : []);
    const edge = [snap(30 * D), snap(30 * D + 1000)];
    expect(pruned(edge).length).toBeLessThanOrEqual(1);
  });
  it('keeps the newest per week after 30 days', () => {
    const w = Math.floor((now - 40 * D) / (7 * D)) * 7 * D + 3 * D; // mid-week
    const mk = (t: number): Snapshot => ({
      name: snapshotFileName(t, 'auto'),
      time: t,
      kind: 'auto',
    });
    const newer = mk(w + D);
    const older = mk(w);
    expect(pruned([newer, older])).toEqual([older.time]);
    const other = mk(w - 7 * D);
    expect(pruned([newer, other])).toEqual([]);
  });
  it('never selects non-auto snapshots', () => {
    const all = (['named', 'pre-restore', 'pre-conflict'] as const).flatMap((k) => [
      snap(100 * D, k),
      snap(100 * D + 1000, k),
    ]);
    expect(selectPrunable(all, now)).toEqual([]);
  });
});

describe('diff', () => {
  const kinds = (a: string, b: string) => diff(a, b).map((h) => [h.kind, h.lines]);
  it('identical text is one equal hunk', () => {
    expect(kinds('a\nb', 'a\nb')).toEqual([['equal', ['a', 'b']]]);
    expect(diffStats(diff('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 });
  });
  it('pure add and pure remove', () => {
    expect(kinds('a', 'a\nb\nc')).toEqual([
      ['equal', ['a']],
      ['add', ['b', 'c']],
    ]);
    expect(kinds('a\nb\nc', 'a')).toEqual([
      ['equal', ['a']],
      ['remove', ['b', 'c']],
    ]);
  });
  it('mixed change in the middle', () => {
    expect(kinds('a\nb\nc\nd', 'a\nB\nc\nd')).toEqual([
      ['equal', ['a']],
      ['remove', ['b']],
      ['add', ['B']],
      ['equal', ['c', 'd']],
    ]);
    expect(diffStats(diff('a\nb\nc', 'a\nx\ny\nc'))).toEqual({ added: 2, removed: 1 });
  });
  it('collapses unchanged runs longer than 6 lines', () => {
    const run = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`).join('\n');
    expect(COLLAPSE_OVER).toBe(6);
    const rows = diffRows(diff(`${run(7)}\nX`, `${run(7)}\nY`));
    expect(rows).toEqual([
      { kind: 'collapsed', count: 7 },
      { kind: 'remove', text: 'X' },
      { kind: 'add', text: 'Y' },
    ]);
    expect(diffRows(diff(`${run(6)}\nX`, `${run(6)}\nY`))[0]).toEqual({
      kind: 'equal',
      text: 'l0',
    });
  });
});
