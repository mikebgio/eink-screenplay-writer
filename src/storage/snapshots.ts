import { syncHash, type FileRef, type SidecarStore, type StoragePort } from './port';

export type SnapshotKind = 'auto' | 'named' | 'pre-restore' | 'pre-conflict';

export const AUTO_INTERVAL_MS = 10 * 60 * 1000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export interface Snapshot {
  name: string;
  /** Epoch ms (UTC, whole seconds). */
  time: number;
  kind: SnapshotKind;
  /** Slug of the label, if any. The full label is in the file's first-line comment. */
  slug?: string;
}

/** `.the-long-night.snapshots` for `the-long-night.fountain`. */
export function snapshotDirName(scriptName: string): string {
  const raw = scriptName.replace(/\.[^./]+$/, '') || scriptName;
  const safe = raw
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\./, '_')
    .slice(0, 100);
  // Names that needed changing get a hash of the original, so different scripts never share a folder.
  return `.${safe}${safe === raw ? '' : `-${syncHash(raw).slice(0, 8)}`}.snapshots`;
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export function snapshotFileName(time: number, kind: SnapshotKind, label?: string): string {
  const stamp = new Date(time)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  const slug = label ? slugify(label) : '';
  return `${stamp}--${kind}${slug ? `--${slug}` : ''}.fountain`;
}

const NAME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z--(auto|named|pre-restore|pre-conflict)(?:--([a-z0-9-]+))?\.fountain$/;

export function parseSnapshotName(name: string): Snapshot | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const time = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  if (Number.isNaN(time)) return null;
  return { name, time, kind: m[5] as SnapshotKind, ...(m[6] ? { slug: m[6] } : {}) };
}

const LABEL_RE = /^\[\[snapshot: ([^\]\n]*)\]\]\n/;

/** Prepend the label comment (named snapshots keep their full label here). */
export function withLabel(text: string, label?: string): string {
  // A script that itself starts with the marker gets an empty header, so it can't be mistaken for one.
  if (!label && !text.startsWith('[[snapshot:')) return text;
  return `[[snapshot: ${(label ?? '').replace(/[\]\n]/g, ' ')}]]\n${text}`;
}

/** Split a snapshot file into its label (if any) and the script text. */
export function splitLabel(raw: string): { label?: string; text: string } {
  const m = LABEL_RE.exec(raw);
  return m ? { ...(m[1] ? { label: m[1] } : {}), text: raw.slice(m[0].length) } : { text: raw };
}

/**
 * Auto snapshots to delete. Keeps everything ≤ 24 h old, the newest per hour for 7 days,
 * the newest per day for 30 days, then the newest per week. Other kinds are never pruned.
 */
export function selectPrunable(snapshots: Snapshot[], now: number): Snapshot[] {
  const autos = snapshots.filter((s) => s.kind === 'auto').sort((a, b) => b.time - a.time);
  const seen = new Set<string>();
  const out: Snapshot[] = [];
  for (const s of autos) {
    const age = now - s.time;
    if (age <= DAY) continue;
    const bucket =
      age <= 7 * DAY
        ? `h${Math.floor(s.time / HOUR)}`
        : age <= 30 * DAY
          ? `d${Math.floor(s.time / DAY)}`
          : `w${Math.floor(s.time / (7 * DAY))}`;
    if (seen.has(bucket)) out.push(s);
    else seen.add(bucket);
  }
  return out;
}

export interface SnapshotServiceOptions {
  storage: StoragePort;
  /** App-private store for single-file mode, keyed by the file's URI. */
  privateStore: (key: string) => SidecarStore;
  now?: () => number;
}

export interface SnapshotEntry extends Snapshot {
  label?: string;
}

/**
 * Snapshots of one open script. Ticket 12 calls `take(text, 'pre-conflict')` before it
 * overwrites or replaces anything.
 */
export class SnapshotService {
  /** True when snapshots live in app-private storage (single-file mode). */
  deviceOnly = false;
  private ref: FileRef | null = null;
  private store: SidecarStore | null = null;
  private lastHash: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private getText: () => string = () => '';

  constructor(private readonly o: SnapshotServiceOptions) {}

  private now() {
    return (this.o.now ?? Date.now)();
  }

  /** Start for a newly opened file; takes the on-open auto snapshot and starts the 10-minute timer. */
  async attach(ref: FileRef, text: string, getText: () => string): Promise<void> {
    this.detach();
    this.ref = ref;
    this.getText = getText;
    const shared = this.o.storage.sidecar(ref);
    this.deviceOnly = shared === null;
    this.store = shared ?? this.o.privateStore(ref.uri);
    const list = await this.list();
    const newest = list.at(-1);
    this.lastHash = null;
    if (newest) {
      const raw = await this.store.read(newest.name);
      if (raw !== null) this.lastHash = syncHash(splitLabel(raw).text);
    }
    await this.take(text, 'auto');
    this.timer = setInterval(() => void this.tick(), AUTO_INTERVAL_MS);
  }

  detach(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.ref = null;
    this.store = null;
  }

  private async tick(): Promise<void> {
    try {
      await this.take(this.getText(), 'auto');
    } catch {
      /* a failed auto snapshot must not disturb editing */
    }
  }

  /**
   * Write a snapshot. Returns null (nothing written) if the content equals the previous snapshot's,
   * except for named snapshots.
   */
  async take(text: string, kind: SnapshotKind, label?: string): Promise<Snapshot | null> {
    if (!this.store) throw new Error('No file attached');
    const hash = syncHash(text);
    // Never two identical snapshots in a row. A named one is the writer's explicit ask: always written.
    if (kind !== 'named' && hash === this.lastHash) return null;
    let time = Math.floor(this.now() / 1000) * 1000;
    let name = snapshotFileName(time, kind, label);
    const existing = new Set(await this.store.list());
    while (existing.has(name)) {
      time += 1000;
      name = snapshotFileName(time, kind, label);
    }
    await this.store.write(name, withLabel(text, label));
    this.lastHash = hash;
    if (kind === 'auto') await this.prune();
    return { name, time, kind, ...(label && slugify(label) ? { slug: slugify(label) } : {}) };
  }

  /** Snapshots oldest → newest. */
  async list(): Promise<Snapshot[]> {
    if (!this.store) return [];
    const names = await this.store.list();
    return names
      .map(parseSnapshotName)
      .filter((s): s is Snapshot => s !== null)
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /** Newest first, with full labels. */
  async entries(): Promise<SnapshotEntry[]> {
    const out: SnapshotEntry[] = [];
    for (const s of (await this.list()).reverse()) {
      const raw = await this.store?.read(s.name);
      const label = raw ? splitLabel(raw).label : undefined;
      out.push(label ? { ...s, label } : s);
    }
    return out;
  }

  async read(snapshot: Snapshot): Promise<string> {
    const raw = await this.store?.read(snapshot.name);
    if (raw === null || raw === undefined) throw new Error('Snapshot not found');
    return splitLabel(raw).text;
  }

  /** Saves `currentText` as a pre-restore snapshot, then returns the snapshot's text to apply. */
  async restore(snapshot: Snapshot, currentText: string): Promise<string> {
    const text = await this.read(snapshot);
    await this.take(currentText, 'pre-restore');
    return text;
  }

  /** Only named snapshots can be deleted by hand. */
  async remove(snapshot: Snapshot): Promise<void> {
    if (snapshot.kind !== 'named') throw new Error('Only named snapshots can be deleted');
    await this.store?.remove(snapshot.name);
  }

  private async prune(): Promise<void> {
    if (!this.store) return;
    for (const s of selectPrunable(await this.list(), this.now())) await this.store.remove(s.name);
  }
}
