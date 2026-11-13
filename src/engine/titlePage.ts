import { parse, titlePageLayout } from './parse';
import { VAR_PREFIX } from './variables';
import { applyChanges, type TextChange } from './variableEdits';

/** The title-page fields the form edits, in the order they are written. */
export const TITLE_FIELDS = [
  { id: 'title', key: 'Title', label: 'Title' },
  { id: 'credit', key: 'Credit', label: 'Credit' },
  { id: 'author', key: 'Author', label: 'Author' },
  { id: 'source', key: 'Source', label: 'Source' },
  { id: 'draftDate', key: 'Draft date', label: 'Draft date' },
  { id: 'contact', key: 'Contact', label: 'Contact' },
  { id: 'notes', key: 'Notes', label: 'Notes' },
] as const;

export type TitleFieldId = (typeof TITLE_FIELDS)[number]['id'];
/** Field values; several lines are separated by "\n". An empty string clears the field. */
export type TitleValues = Record<TitleFieldId, string>;
export type TitleChanges = Partial<TitleValues>;

/** Shown (and assumed) when a script has no `Credit:` line. */
export const DEFAULT_CREDIT = 'Written by';

const keyEq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

/** Current values of the form fields; a missing Credit reads as "Written by". */
export function titleValues(text: string): TitleValues {
  const entries = parse(text).titlePage;
  const out = {} as TitleValues;
  for (const f of TITLE_FIELDS) {
    out[f.id] = entries.find((e) => keyEq(e.key, f.key))?.value ?? '';
  }
  // Only a missing Credit line reads as the default; a blank one is blank on purpose.
  if (!entries.some((e) => keyEq(e.key, 'Credit'))) out.credit = DEFAULT_CREDIT;
  return out;
}

/** Only the fields whose value differs from what the script holds (so untouched ones aren't written). */
export function diffTitleValues(text: string, values: TitleValues): TitleChanges {
  const before = titleValues(text);
  const hasCredit = parse(text).titlePage.some((e) => keyEq(e.key, 'Credit'));
  const out: TitleChanges = {};
  for (const f of TITLE_FIELDS) {
    const now = normalize(values[f.id]);
    if (now === normalize(before[f.id])) {
      // An absent credit is "Written by" implicitly: only write it if it was changed.
      continue;
    }
    if (f.id === 'credit' && !hasCredit && now === DEFAULT_CREDIT) continue;
    out[f.id] = now;
  }
  return out;
}

/** Trims every line and drops empty ones (an empty line would end the title page). */
function normalize(value: string): string {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join('\n');
}

function format(key: string, value: string, eol: string): string {
  const lines = value.split('\n');
  return lines.length === 1
    ? `${key}: ${lines[0]}`
    : `${key}:${eol}${lines.map((l) => `   ${l}`).join(eol)}`;
}

/**
 * Edits for setting, changing or clearing title-page fields, as source-offset changes (one
 * CodeMirror transaction). Entries that aren't mentioned (`Var-*`, keys from other apps) keep their
 * text and order. New fields go before the first `Var-` entry, or at the end; with no title page,
 * one is created at the top.
 */
export function titlePageChanges(text: string, changes: TitleChanges): TextChange[] {
  const eol = eolOf(text);
  const layout = titlePageLayout(text);
  const entries = layout?.entries ?? [];
  const replaced = new Map<number, string | null>(); // entry index -> new text, or null to remove
  const additions: string[] = [];

  for (const f of TITLE_FIELDS) {
    const raw = changes[f.id];
    if (raw === undefined) continue;
    const value = normalize(raw);
    const idx = entries.findIndex((e) => keyEq(e.key, f.key));
    const entry = entries[idx];
    if (entry) replaced.set(idx, value === '' ? null : format(entry.key, value, eol));
    else if (value !== '') additions.push(format(f.key, value, eol));
  }

  if (!layout) {
    if (additions.length === 0) return [];
    return [{ from: 0, to: 0, insert: additions.join(eol) + eol + (text === '' ? '' : eol) }];
  }

  // Rebuild the block from the entries: untouched ones keep their exact source text and order.
  const blocks: { key: string; text: string }[] = [];
  entries.forEach((e, i) => {
    const r = replaced.get(i);
    if (r === null) return;
    blocks.push({ key: e.key, text: r ?? text.slice(e.from, e.to) });
  });
  if (additions.length > 0) {
    const at = blocks.findIndex((b) => b.key.startsWith(VAR_PREFIX));
    const added = additions.map((t) => ({ key: '', text: t }));
    blocks.splice(at < 0 ? blocks.length : at, 0, ...added);
  }

  const first = entries[0]!.from;
  if (blocks.length === 0) {
    // The whole title page goes, with the blank lines after it.
    const gap = /^(?:\r?\n)+/.exec(text.slice(layout.end))?.[0].length ?? 0;
    return [{ from: first, to: layout.end + gap, insert: '' }];
  }
  const insert = blocks.map((b) => b.text).join(eol);
  if (insert === text.slice(first, layout.end)) return [];
  return [{ from: first, to: layout.end, insert }];
}

/** Pure text-in, text-out version of `titlePageChanges`. */
export function updateTitlePage(text: string, changes: TitleChanges): string {
  return applyChanges(text, titlePageChanges(text, changes));
}
