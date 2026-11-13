import type { FileRef } from './port';

export const RECENT_LIMIT = 10;

/** Move `ref` to the front, drop any earlier entry with the same URI, cap at 10. */
export function addRecent(list: FileRef[], ref: FileRef): FileRef[] {
  return [ref, ...list.filter((r) => r.uri !== ref.uri)].slice(0, RECENT_LIMIT);
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const KEY = 'recentFiles';

export class RecentFiles {
  constructor(private readonly kv: KeyValueStore) {}
  async list(): Promise<FileRef[]> {
    const raw = await this.kv.get(KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as FileRef[];
    } catch {
      return [];
    }
  }
  async add(ref: FileRef): Promise<FileRef[]> {
    const next = addRecent(await this.list(), ref);
    await this.kv.set(KEY, JSON.stringify(next));
    return next;
  }
}
