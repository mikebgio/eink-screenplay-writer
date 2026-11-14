import { classifyLines, parse } from './parse';
import { getVariables, listVariableKeys } from './variables';
import type { Mode } from './editing';

/** Autocomplete sources as pure functions of (text, cursor). The editor only wraps them. */

export interface Suggestion {
  label: string;
  /** Text inserted instead of `label`. */
  apply?: string;
  detail?: string;
}

export interface Suggestions {
  /** Offset where the replaced text starts; it runs up to the cursor. */
  from: number;
  options: Suggestion[];
}

export const SCENE_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'I/E.', 'EST.'];
export const DEFAULT_TIMES = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'EVENING'];

const HEADING = /^(INT\.\/EXT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s(.*)$/i;
const TIME_SEPARATOR = ' - ';

/** Values ordered by how often they occur, then by first appearance. */
function byFrequency(values: string[]): string[] {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!);
}

/** Splits the text after a heading's prefix into location and time of day (at the last ` - `). */
export function splitHeading(rest: string): { location: string; time?: string } {
  const i = rest.lastIndexOf(TIME_SEPARATOR);
  if (i < 0) return { location: rest.trim() };
  return { location: rest.slice(0, i).trim(), time: rest.slice(i + TIME_SEPARATOR.length).trim() };
}

/** Character identities (`{{HERO}}` stays `{{HERO}}`), most frequent first. */
export function characterNames(text: string, skipLine = -1): string[] {
  const names = parse(text)
    .elements.filter((e) => e.type === 'character' && !(skipLine >= e.startLine && skipLine <= e.endLine))
    .map((e) => e.identity ?? e.text)
    .filter((n) => n !== '');
  return byFrequency(names);
}

function headingParts(text: string, skipLine: number): { locations: string[]; times: string[] } {
  const locations: string[] = [];
  const times: string[] = [];
  for (const e of parse(text).elements) {
    if (e.type !== 'scene-heading' || (skipLine >= e.startLine && skipLine <= e.endLine)) continue;
    const m = HEADING.exec(e.text);
    if (!m) continue;
    const { location, time } = splitHeading(m[2]!);
    if (location) locations.push(location.toUpperCase());
    if (time) times.push(time.toUpperCase());
  }
  return { locations: byFrequency(locations), times: byFrequency(times) };
}

/** Options minus the one that already equals what was typed, so a finished word closes the list. */
function without(options: Suggestion[], typed: string): Suggestion[] {
  const t = typed.toUpperCase();
  return options.filter((o) => o.label.toUpperCase() !== t);
}

function finish(from: number, options: Suggestion[], typed: string): Suggestions | null {
  const left = without(options, typed);
  return left.length > 0 ? { from, options: left } : null;
}

/**
 * What to offer at `cursor`, or `null`:
 * - after `{{`: variable keys, each with its value
 * - on a scene heading: prefixes, then locations already used, then (after ` - `) times of day
 * - on a cue line (character mode, a `@` line, or a recognised cue): the script's characters
 */
export function suggestionsAt(text: string, cursor: number, mode: Mode = null): Suggestions | null {
  const lineFrom = text.lastIndexOf('\n', cursor - 1) + 1;
  const before = text.slice(lineFrom, cursor);
  const lineIndex = text.slice(0, lineFrom).split('\n').length - 1;

  // Variables
  const v = /\{\{([A-Za-z0-9_]*)$/.exec(before);
  if (v) {
    const doc = parse(text);
    const values = new Map(getVariables(doc).map((e) => [e.key, e.value]));
    const closed = text.startsWith('}}', cursor);
    const options = listVariableKeys(doc).map((key) => ({
      label: key,
      apply: closed ? key : `${key}}}`,
      detail: values.get(key) ?? 'undefined',
    }));
    return finish(cursor - v[1]!.length, options, v[1]!);
  }

  if (!mode) {
    const prevBlank = lineIndex === 0 || text.slice(0, lineFrom - 1).split('\n').pop()!.trim() === '';
    // Scene-heading prefixes: only once two characters are typed, so ordinary action isn't interrupted.
    if (prevBlank && before.length >= 2 && /^[A-Za-z./]+$/.test(before)) {
      const typed = before.toUpperCase();
      const options = SCENE_PREFIXES.filter((p) => p.startsWith(typed)).map((p) => ({
        label: p,
        apply: `${p} `,
      }));
      if (options.length > 0) return finish(lineFrom, options, typed);
    }
    const h = HEADING.exec(before);
    if (h) {
      const restFrom = cursor - h[2]!.length;
      const { locations, times } = headingParts(text, lineIndex);
      const rest = h[2]!;
      const sep = rest.lastIndexOf(TIME_SEPARATOR);
      if (sep >= 0) {
        const typed = rest.slice(sep + TIME_SEPARATOR.length);
        const all = [...DEFAULT_TIMES, ...times.filter((t) => !DEFAULT_TIMES.includes(t))];
        return finish(restFrom + sep + TIME_SEPARATOR.length, all.map((label) => ({ label })), typed);
      }
      return finish(restFrom, locations.map((label) => ({ label })), rest);
    }
  }

  // Characters
  const forced = before.startsWith('@');
  const cueLine = mode === 'character' || forced || classifyLines(text)[lineIndex] === 'character';
  if (cueLine && !before.includes('(')) {
    const typed = forced ? before.slice(1) : before;
    const names = characterNames(text, lineIndex);
    return finish(lineFrom + (forced ? 1 : 0), names.map((label) => ({ label })), typed);
  }
  return null;
}
