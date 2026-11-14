/**
 * The central command registry: every shortcut in the app is registered here, so duplicates are caught
 * and the help overlay (Ctrl+/) can list them all. Later tickets call `registerCommand` too.
 */

export interface CommandContext {
  /** The editor view, when the command was triggered from inside the editor. */
  view?: import('@codemirror/view').EditorView;
  /** Where the key event came from. */
  target?: EventTarget | null;
}

export interface Command {
  /** Stable name, e.g. `file.save`. Registering the same id again replaces the earlier command. */
  id: string;
  /** Shown in the shortcut help. */
  label: string;
  /** One or more bindings, e.g. `Ctrl+Shift+Z`, `Tab`, `Ctrl+/`. */
  keys: string | string[];
  /** Return `false` to let the key through to whatever else handles it. */
  run: (ctx: CommandContext) => boolean | void;
  /** `editor` commands are bound inside CodeMirror; `global` ones on the window. Default `global`. */
  scope?: 'global' | 'editor';
  /** Global commands skip key events from text inputs when this is `false` (default `true`). */
  inInputs?: boolean;
  /** Return `false` to disable the command for now (e.g. no document open). */
  enabled?: () => boolean;
}

/** Keys promised to later tickets: only the command with the listed id may use them. */
export const RESERVED_KEYS: Record<string, string> = {
  'Ctrl+Shift+S': 'snapshot.name', // ticket 11
  'Ctrl+G': 'navigator.open', // ticket 13
  'Ctrl+E': 'export.open', // ticket 09
  'Ctrl+F': 'find.open', // ticket 14
  'Ctrl+Shift+D': 'debug.toggle', // ticket 02
};

const NAMES: Record<string, string> = { esc: 'Escape', ' ': 'Space', spacebar: 'Space' };

/** `ctrl+shift+z` → `Ctrl+Shift+Z`: modifiers in a fixed order, a single key upper-cased. */
export function normalizeKey(spec: string): string {
  const parts = spec.split('+').map((p) => p.trim());
  if (spec.endsWith('++')) parts.splice(parts.length - 2, 2, '+');
  const key = parts.pop() ?? '';
  const mods = new Set(parts.map((m) => m.toLowerCase()).map((m) => (m === 'mod' || m === 'cmd' || m === 'meta' ? 'ctrl' : m)));
  const k = NAMES[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1).toLowerCase());
  return [mods.has('ctrl') && 'Ctrl', mods.has('alt') && 'Alt', mods.has('shift') && 'Shift', k].filter(Boolean).join('+');
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** The normalised binding for a key event (the Mac ⌘ key counts as Ctrl). */
export function eventToKey(e: KeyLike): string {
  return normalizeKey(
    [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key === '+' ? '+' : e.key]
      .filter(Boolean)
      .join('+')
      .replace(/\+\+$/, '++'),
  );
}

/** `Ctrl+Shift+Z` → CodeMirror's `Ctrl-Shift-z`. */
export function toCodeMirrorKey(key: string): string {
  const parts = key.split('+');
  const last = parts.pop()!;
  return [...parts, last.length === 1 ? last.toLowerCase() : last].join('-');
}

function isDev(): boolean {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  return env?.DEV ?? true;
}

export class CommandRegistry {
  private byId = new Map<string, Command & { keyList: string[] }>();
  private byKey = new Map<string, string>();
  /** Duplicate bindings throw when strict (development, tests); otherwise they are dropped with a warning. */
  constructor(private strict: boolean = isDev()) {}

  /** Registers a command and returns a function that removes it again. */
  register(cmd: Command): () => void {
    this.unregister(cmd.id);
    const keyList = (Array.isArray(cmd.keys) ? cmd.keys : [cmd.keys]).map(normalizeKey);
    const accepted: string[] = [];
    for (const key of keyList) {
      const owner = this.byKey.get(key);
      const reserved = RESERVED_KEYS[key];
      const problem =
        owner !== undefined
          ? `${key} is already bound to "${owner}"`
          : reserved !== undefined && reserved !== cmd.id
            ? `${key} is reserved for "${reserved}"`
            : null;
      if (problem) {
        const msg = `Cannot bind ${key} to "${cmd.id}": ${problem}`;
        if (this.strict) {
          for (const k of accepted) this.byKey.delete(k);
          throw new Error(msg);
        }
        console.warn(msg);
        continue;
      }
      this.byKey.set(key, cmd.id);
      accepted.push(key);
    }
    this.byId.set(cmd.id, { ...cmd, keyList: accepted });
    return () => {
      if (this.byId.get(cmd.id)?.run === cmd.run) this.unregister(cmd.id);
    };
  }

  unregister(id: string): void {
    const old = this.byId.get(id);
    if (!old) return;
    for (const k of old.keyList) this.byKey.delete(k);
    this.byId.delete(id);
  }

  /** Every command, in registration order, with its normalised keys. */
  list(): { id: string; label: string; keys: string[]; scope: 'global' | 'editor' }[] {
    return [...this.byId.values()].map((c) => ({
      id: c.id,
      label: c.label,
      keys: c.keyList,
      scope: c.scope ?? 'global',
    }));
  }

  get(id: string): Command | undefined {
    return this.byId.get(id);
  }

  /** The command bound to `key`, if any. */
  forKey(key: string): Command | undefined {
    const id = this.byKey.get(normalizeKey(key));
    return id === undefined ? undefined : this.byId.get(id);
  }

  /** Editor-scope bindings as CodeMirror key bindings. */
  editorBindings(): { key: string; run: (view: import('@codemirror/view').EditorView) => boolean; preventDefault: boolean }[] {
    const out = [];
    for (const c of this.byId.values()) {
      if (c.scope !== 'editor') continue;
      for (const k of c.keyList) {
        out.push({
          key: toCodeMirrorKey(k),
          preventDefault: true,
          run: (view: import('@codemirror/view').EditorView) =>
            (!c.enabled || c.enabled()) && c.run({ view, target: view.dom }) !== false,
        });
      }
    }
    return out;
  }

  /** Handles a window key event for global commands; returns whether one ran. */
  handleEvent(e: KeyboardEvent): boolean {
    const cmd = this.forKey(eventToKey(e));
    if (!cmd || (cmd.scope ?? 'global') !== 'global') return false;
    if (cmd.enabled && !cmd.enabled()) return false;
    const el = e.target as HTMLElement | null;
    if (cmd.inInputs === false && el?.closest?.('input, textarea, select, .drawer')) return false;
    if (cmd.run({ target: e.target }) === false) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
}

export const commands = new CommandRegistry();
export const registerCommand = (cmd: Command): (() => void) => commands.register(cmd);

/** Formats `Ctrl+Shift+Z` for display. */
export function formatKey(key: string): string {
  return key.replace(/\+/g, ' + ');
}
