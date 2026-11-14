import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry, eventToKey, normalizeKey, toCodeMirrorKey } from '../src/ui/commands';

const noop = () => {};

describe('command registry', () => {
  it('normalises key names', () => {
    expect(normalizeKey('ctrl+shift+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeKey('Shift+Ctrl+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeKey('mod+/')).toBe('Ctrl+/');
    expect(normalizeKey('tab')).toBe('Tab');
    expect(normalizeKey('Esc')).toBe('Escape');
    expect(toCodeMirrorKey('Ctrl+Shift+Z')).toBe('Ctrl-Shift-z');
    expect(toCodeMirrorKey('Shift+Tab')).toBe('Shift-Tab');
  });
  it('turns key events into bindings', () => {
    const ev = { key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
    expect(eventToKey(ev)).toBe('Ctrl+Shift+Z');
    expect(eventToKey({ ...ev, ctrlKey: false, metaKey: true })).toBe('Ctrl+Shift+Z');
    expect(eventToKey({ ...ev, key: 'Tab', ctrlKey: false, shiftKey: false })).toBe('Tab');
  });
  it('throws on a duplicate key binding in strict (development) mode', () => {
    const r = new CommandRegistry(true);
    r.register({ id: 'a', label: 'A', keys: 'Ctrl+K', run: noop });
    expect(() => r.register({ id: 'b', label: 'B', keys: ['ctrl+k'], run: noop })).toThrow(/already bound to "a"/);
    expect(r.list().map((c) => c.id)).toEqual(['a']);
  });
  it('drops a duplicate binding with a warning outside development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const r = new CommandRegistry(false);
    r.register({ id: 'a', label: 'A', keys: 'Ctrl+K', run: noop });
    r.register({ id: 'b', label: 'B', keys: ['Ctrl+K', 'Ctrl+J'], run: noop });
    expect(warn).toHaveBeenCalled();
    expect(r.list().find((c) => c.id === 'b')!.keys).toEqual(['Ctrl+J']);
    warn.mockRestore();
  });
  it('re-registering the same id replaces it (hot reload) and frees its keys', () => {
    const r = new CommandRegistry(true);
    r.register({ id: 'a', label: 'A', keys: 'Ctrl+K', run: noop });
    r.register({ id: 'a', label: 'A2', keys: 'Ctrl+L', run: noop });
    expect(r.list()).toHaveLength(1);
    r.register({ id: 'b', label: 'B', keys: 'Ctrl+K', run: noop });
  });
  it('the returned function unregisters', () => {
    const r = new CommandRegistry(true);
    const off = r.register({ id: 'a', label: 'A', keys: 'Ctrl+K', run: noop });
    off();
    expect(r.list()).toEqual([]);
    r.register({ id: 'b', label: 'B', keys: 'Ctrl+K', run: noop });
  });
  it('keeps keys reserved for later tickets', () => {
    const r = new CommandRegistry(true);
    expect(() => r.register({ id: 'mine', label: 'X', keys: 'Ctrl+G', run: noop })).toThrow(/reserved/);
    r.register({ id: 'navigator.open', label: 'Navigator', keys: 'Ctrl+G', run: noop });
  });
  it('lists every registered command, with its keys, for the shortcut help', () => {
    const r = new CommandRegistry(true);
    r.register({ id: 'a', label: 'Save', keys: 'ctrl+s', run: noop });
    r.register({ id: 'b', label: 'Redo', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], run: noop, scope: 'editor' });
    expect(r.list()).toEqual([
      { id: 'a', label: 'Save', keys: ['Ctrl+S'], scope: 'global' },
      { id: 'b', label: 'Redo', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], scope: 'editor' },
    ]);
  });
  it('builds CodeMirror bindings for editor commands only', () => {
    const r = new CommandRegistry(true);
    r.register({ id: 'a', label: 'Save', keys: 'Ctrl+S', run: noop });
    r.register({ id: 'b', label: 'Force', keys: ['Ctrl+1', 'Shift+Tab'], run: noop, scope: 'editor' });
    expect(r.editorBindings().map((b) => b.key)).toEqual(['Ctrl-1', 'Shift-Tab']);
  });
  it('dispatches a window key event to the global command', () => {
    const r = new CommandRegistry(true);
    const run = vi.fn();
    r.register({ id: 'a', label: 'A', keys: 'Ctrl+S', run });
    const e = { key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target: null,
      preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;
    expect(r.handleEvent(e)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });
  it('lets the key through when the command is disabled or declines', () => {
    const r = new CommandRegistry(true);
    r.register({ id: 'a', label: 'A', keys: 'Ctrl+S', run: () => false });
    const e = { key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target: null,
      preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;
    expect(r.handleEvent(e)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
