import { parse, titlePageLayout } from './parse';
import { VAR_PREFIX, VARIABLE_KEY, variableUses } from './variables';

/** A text edit in original-document offsets; same meaning as a CodeMirror change. */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export type EditResult = { changes: TextChange[] } | { error: string };

/** Applies changes that all refer to offsets in the original `text`. */
export function applyChanges(text: string, changes: TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

export function validateKey(key: string): string | null {
  return VARIABLE_KEY.test(key) ? null : 'Variable keys must be UPPER_CASE';
}

export function validateValue(value: string): string | null {
  return /[\r\n]/.test(value) ? 'A value can’t contain line breaks' : null;
}

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

function definition(text: string, key: string) {
  const layout = titlePageLayout(text);
  const entry = layout?.entries.find((e) => e.key === VAR_PREFIX + key);
  return { layout, entry };
}

/** Sets the value of `key`, adding its `Var-` line (and a title page, if there is none) when missing. */
export function setVariable(text: string, key: string, value: string): EditResult {
  const error = validateKey(key) ?? validateValue(value);
  if (error) return { error };
  const line = `${VAR_PREFIX}${key}: ${value.trim()}`.trimEnd();
  const { layout, entry } = definition(text, key);
  if (entry) return { changes: [{ from: entry.from, to: entry.to, insert: line }] };
  const eol = eolOf(text);
  if (layout) return { changes: [{ from: layout.end, to: layout.end, insert: eol + line }] };
  return {
    changes: [{ from: 0, to: 0, insert: line + eol + (text === '' ? '' : eol) }],
  };
}

/** Removes the `Var-KEY` line only; uses in the script are untouched (they become undefined). */
function removeDefinition(text: string, key: string): TextChange[] {
  const { layout, entry } = definition(text, key);
  if (!layout || !entry) return [];
  const eol = eolOf(text);
  if (layout.entries.length === 1) {
    const gap = /^(?:\r?\n)+/.exec(text.slice(layout.end))?.[0].length ?? 0;
    return [{ from: 0, to: layout.end + gap, insert: '' }];
  }
  if (entry === layout.entries[layout.entries.length - 1]) {
    return [{ from: entry.from - eol.length, to: entry.to, insert: '' }];
  }
  return [{ from: entry.from, to: entry.to + eol.length, insert: '' }];
}

/**
 * Renames the definition and every `{{OLD}}` in the script. Returns all changes so the caller can
 * apply them in one transaction (one undo step).
 */
export function renameVariable(text: string, oldKey: string, newKey: string): EditResult {
  const error = validateKey(newKey);
  if (error) return { error };
  if (newKey === oldKey) return { changes: [] };
  if (definition(text, newKey).entry) return { error: `${newKey} already exists` };
  const { entry } = definition(text, oldKey);
  const changes: TextChange[] = [];
  if (entry) {
    changes.push({ from: entry.from, to: entry.from + VAR_PREFIX.length + oldKey.length, insert: VAR_PREFIX + newKey });
  }
  for (const u of variableUses(parse(text))) {
    if (u.key === oldKey) changes.push({ from: u.from, to: u.to, insert: `{{${newKey}}}` });
  }
  return { changes };
}

/**
 * Deletes a variable. `inline` first replaces each use with the current value (uppercased in a
 * character cue); `undefine` leaves the uses in place, so they show as undefined.
 */
export function deleteVariable(
  text: string,
  key: string,
  uses: 'inline' | 'undefine',
): EditResult {
  const { entry } = definition(text, key);
  const changes = removeDefinition(text, key);
  if (uses === 'inline' && entry) {
    for (const u of variableUses(parse(text))) {
      if (u.key !== key) continue;
      changes.push({ from: u.from, to: u.to, insert: u.inCue ? entry.value.toUpperCase() : entry.value });
    }
  }
  return { changes };
}
