import type { ScriptDocument, ScriptElement, StyleSpan, TitleEntry } from './types';

/** Variables are written `{{KEY}}`; KEY is UPPER_CASE (decision in ticket 07). */
export const VARIABLE_KEY = /^[A-Z][A-Z0-9_]*$/;
/** Title-page entries that define variables start with this prefix: `Var-HERO: Jack Reyes`. */
export const VAR_PREFIX = 'Var-';

export interface SourceRange {
  from: number;
  to: number;
}

export interface VariableDiagnostic {
  /** The key; for `invalid`, the text found between the braces. */
  key: string;
  /**
   * `undefined`: used but never defined. `unused`: defined but never used.
   * `invalid`: braces around something that isn't an UPPER_CASE key (left as literal text).
   */
  kind: 'undefined' | 'unused' | 'invalid';
  /** Source offsets of each `{{...}}`; empty for `unused`. */
  positions: SourceRange[];
}

/** One `{{KEY}}` use in the script (valid keys only). */
export interface VariableUse extends SourceRange {
  key: string;
  elementIndex: number;
  /** The line of the element that contains the use, shortened. */
  excerpt: string;
  /** True inside a character cue, where the value is printed in uppercase. */
  inCue: boolean;
}

export interface ResolveResult {
  /** The document with values substituted (`resolve` mode) and escapes removed. Element order is unchanged. */
  doc: ScriptDocument;
  /** Defined variables in file order (`Var-` entries, key without the prefix). */
  variables: TitleEntry[];
  diagnostics: VariableDiagnostic[];
}

const TOKEN = /\\\{\{|\{\{([^{}\n]*)\}\}/g;

interface Token extends SourceRange {
  kind: 'use' | 'invalid' | 'escape';
  /** Inner text of the braces. */
  key: string;
}

/** Finds `{{KEY}}`, invalid `{{...}}` and `\{{` in `s`. Offsets are into `s`. */
export function scanTokens(s: string): Token[] {
  if (!s.includes('{{')) return [];
  const out: Token[] = [];
  for (const m of s.matchAll(TOKEN)) {
    const from = m.index;
    const to = from + m[0].length;
    if (m[0][0] === '\\') out.push({ from, to, kind: 'escape', key: '' });
    else if (m[1] === '') continue;
    else if (VARIABLE_KEY.test(m[1]!)) out.push({ from, to, kind: 'use', key: m[1]! });
    else out.push({ from, to, kind: 'invalid', key: m[1]! });
  }
  return out;
}

/** The defined variables of a document, in file order. The first definition of a key wins. */
export function getVariables(doc: ScriptDocument): TitleEntry[] {
  const seen = new Set<string>();
  const out: TitleEntry[] = [];
  for (const e of doc.titlePage) {
    if (!e.key.startsWith(VAR_PREFIX)) continue;
    const key = e.key.slice(VAR_PREFIX.length);
    if (!VARIABLE_KEY.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value: e.value });
  }
  return out;
}

const SKIP_USES = new Set(['note', 'boneyard', 'page-break']);

/** Every valid `{{KEY}}` use in the printed body, with source positions. Notes and boneyard are skipped. */
export function variableUses(doc: ScriptDocument): VariableUse[] {
  const out: VariableUse[] = [];
  doc.elements.forEach((el, elementIndex) => {
    if (SKIP_USES.has(el.type)) return;
    for (const t of scanTokens(el.raw)) {
      if (t.kind !== 'use') continue;
      const from = el.from + t.from;
      const to = el.from + t.to;
      if (el.notes?.some((n) => from < n.to && to > n.from)) continue;
      out.push({
        key: t.key,
        from,
        to,
        elementIndex,
        excerpt: excerptAround(el.raw, t.from, t.to),
        inCue: el.type === 'character',
      });
    }
  });
  return out;
}

function excerptAround(raw: string, from: number, to: number): string {
  const start = raw.lastIndexOf('\n', from) + 1;
  let end = raw.indexOf('\n', to);
  if (end < 0) end = raw.length;
  const line = raw.slice(start, end).trim();
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

/** Keys an editor can offer: every defined key plus every valid key used in the script. Sorted. */
export function listVariableKeys(doc: ScriptDocument): string[] {
  const keys = new Set(getVariables(doc).map((v) => v.key));
  for (const u of variableUses(doc)) keys.add(u.key);
  return [...keys].sort();
}

interface Substituted {
  text: string;
  /** Maps an offset in the original text to the substituted text. */
  map: (offset: number) => number;
}

function substitute(
  text: string,
  values: Map<string, string>,
  mode: 'resolve' | 'keep',
  upper: boolean,
): Substituted {
  const tokens = scanTokens(text);
  if (tokens.length === 0) return { text, map: (o) => o };
  let out = '';
  let pos = 0;
  const segs: { from: number; to: number; newFrom: number; newTo: number }[] = [];
  for (const t of tokens) {
    let rep: string | undefined;
    if (t.kind === 'escape') rep = '{{';
    else if (t.kind === 'use' && mode === 'resolve' && values.has(t.key)) {
      rep = values.get(t.key)!;
      if (upper) rep = rep.toUpperCase();
    }
    if (rep === undefined) continue;
    out += text.slice(pos, t.from);
    segs.push({ from: t.from, to: t.to, newFrom: out.length, newTo: out.length + rep.length });
    out += rep;
    pos = t.to;
  }
  out += text.slice(pos);
  const map = (o: number): number => {
    let shift = 0;
    for (const s of segs) {
      if (s.to <= o) shift = s.newTo - s.to;
      else if (s.from < o) return o <= s.from ? s.newFrom : s.newTo;
      else break;
    }
    return o + shift;
  };
  return { text: out, map };
}

/** Name of a cue without its trailing `(extension)` groups. */
function cueName(text: string): string {
  let name = text;
  while (name.endsWith(')') && name.includes('(')) name = name.slice(0, name.lastIndexOf('(')).trimEnd();
  return name;
}

function resolveElement(
  el: ScriptElement,
  values: Map<string, string>,
  mode: 'resolve' | 'keep',
): ScriptElement {
  if (SKIP_USES.has(el.type) || !el.text.includes('{{')) return el;
  const isCue = el.type === 'character';
  const sub = substitute(el.text, values, mode, isCue);
  const out: ScriptElement = { ...el, text: sub.text };
  if (isCue && el.identity === undefined) out.identity = cueName(el.text);
  if (el.styles) {
    out.styles = el.styles.map(
      (s): StyleSpan => ({ ...s, from: sub.map(s.from), to: sub.map(s.to) }),
    );
  }
  return out;
}

/**
 * Substitutes `{{KEY}}` with the values defined in the title page's `Var-KEY:` entries.
 * Runs after `parse` and before `paginate`. `keep` mode leaves `{{KEY}}` in place (for export
 * with variables intact); escapes `\{{` become `{{` in both modes. Undefined keys stay as
 * `{{KEY}}` and are reported in `diagnostics`. `Var-` entries are dropped from the title page.
 */
export function resolve(
  doc: ScriptDocument,
  options: { mode: 'resolve' | 'keep' } = { mode: 'resolve' },
): ResolveResult {
  const variables = getVariables(doc);
  const values = new Map(variables.map((v) => [v.key, v.value]));
  const { mode } = options;

  const titlePage = doc.titlePage
    .filter((e) => !e.key.startsWith(VAR_PREFIX))
    .map((e) => ({ key: e.key, value: substitute(e.value, values, mode, false).text }));
  const elements = doc.elements.map((el) => resolveElement(el, values, mode));

  const undefinedKeys = new Map<string, SourceRange[]>();
  const used = new Set<string>();
  for (const u of variableUses(doc)) {
    used.add(u.key);
    if (!values.has(u.key)) {
      const list = undefinedKeys.get(u.key) ?? [];
      list.push({ from: u.from, to: u.to });
      undefinedKeys.set(u.key, list);
    }
  }
  const invalid = new Map<string, SourceRange[]>();
  doc.elements.forEach((el) => {
    if (SKIP_USES.has(el.type)) return;
    for (const t of scanTokens(el.raw)) {
      if (t.kind !== 'invalid') continue;
      const list = invalid.get(t.key) ?? [];
      list.push({ from: el.from + t.from, to: el.from + t.to });
      invalid.set(t.key, list);
    }
  });

  const diagnostics: VariableDiagnostic[] = [
    ...[...undefinedKeys].map(([key, positions]): VariableDiagnostic => ({ key, kind: 'undefined', positions })),
    ...variables
      .filter((v) => !used.has(v.key))
      .map((v): VariableDiagnostic => ({ key: v.key, kind: 'unused', positions: [] })),
    ...[...invalid].map(([key, positions]): VariableDiagnostic => ({ key, kind: 'invalid', positions })),
  ];

  return { doc: { titlePage, elements }, variables, diagnostics };
}
