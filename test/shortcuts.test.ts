import { describe, expect, it } from 'vitest';
import { commands } from '../src/ui/commands';
import '../src/ui/editing';

describe('editor shortcuts in the central registry', () => {
  const all = commands.list();
  it('registers Tab, Enter, the force keys, undo and redo without clashing', () => {
    const keys = all.flatMap((c) => c.keys);
    for (const k of ['Tab', 'Shift+Tab', 'Enter', 'Shift+Enter', 'Ctrl+1', 'Ctrl+8', 'Ctrl+Z', 'Ctrl+Shift+Z'])
      expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('every command has a label for the shortcut help', () => {
    for (const c of all) expect(c.label.length).toBeGreaterThan(0);
  });
});
