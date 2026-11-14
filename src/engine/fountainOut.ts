import { extractEmphasis, parse } from './parse';
import { resolve, VAR_PREFIX } from './variables';
import type {
  ElementType,
  ResolvedDocument,
  ScriptDocument,
  ScriptElement,
  StyleSpan,
  TitleEntry,
} from './types';

export interface ToFountainOptions {
  /**
   * A clean copy: `Var-` entries are dropped and every `{{KEY}}` is filled in first (a parsed document
   * that still has `Var-` entries is resolved here). A `{{` left over is literal text, so it is written
   * as `\{{`. With `false` the document is written as it is, `Var-` lines and `{{KEY}}` included.
   */
  dropVariables: boolean;
}

const GROUP = new Set<ElementType>(['character', 'parenthetical', 'dialogue']);
const MARKER: Record<StyleSpan['kind'], string> = { bold: '**', italic: '*', underline: '_' };
const KIND_ORDER: Record<StyleSpan['kind'], number> = { underline: 0, bold: 1, italic: 2 };
/** Same rule as the parser: a first line like this would turn the script into a title page. */
const LOOKS_LIKE_TITLE = /^[A-Za-z0-9][A-Za-z0-9 _-]*?:/;

/**
 * Text with its emphasis written back as Fountain markers. Literal `*` and `_` are escaped only if
 * leaving them alone would change how the line parses.
 */
export function markEmphasis(text: string, styles: readonly StyleSpan[] = []): string {
  const build = (escapeAll: boolean): string => {
    const opens = new Map<number, StyleSpan[]>();
    const closes = new Map<number, StyleSpan[]>();
    for (const s of styles) {
      if (s.to <= s.from) continue;
      (opens.get(s.from) ?? opens.set(s.from, []).get(s.from)!).push(s);
      (closes.get(s.to) ?? closes.set(s.to, []).get(s.to)!).push(s);
    }
    const at = (i: number): string => {
      const c = (closes.get(i) ?? [])
        .slice()
        .sort((a, b) => b.from - a.from || KIND_ORDER[b.kind] - KIND_ORDER[a.kind]);
      const o = (opens.get(i) ?? [])
        .slice()
        .sort((a, b) => b.to - a.to || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
      return c.map((s) => MARKER[s.kind]).join('') + o.map((s) => MARKER[s.kind]).join('');
    };
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += at(i);
      const ch = text[i]!;
      out += escapeAll && (ch === '*' || ch === '_') ? `\\${ch}` : ch;
    }
    return out + at(text.length);
  };
  const key = (s: StyleSpan) => `${s.from}:${s.to}:${s.kind}`;
  const want = styles.map(key).sort().join(',');
  const same = (candidate: string) => {
    const e = extractEmphasis(candidate);
    return e.text === text && e.styles.map(key).sort().join(',') === want;
  };
  const plain = build(false);
  if (same(plain)) return plain;
  const escaped = build(true);
  if (same(escaped)) return escaped;
  // Emphasis that can't be written (e.g. overlapping spans): keep the text, drop the markers.
  return styles.length > 0 ? markEmphasis(text) : plain;
}

function sameElement(a: ScriptElement | undefined, el: ScriptElement): boolean {
  return (
    a !== undefined &&
    a.type === el.type &&
    a.text === el.text &&
    a.sceneNumber === el.sceneNumber &&
    JSON.stringify(a.styles ?? []) === JSON.stringify(el.styles ?? [])
  );
}

/**
 * The first candidate that the parser reads back as `el`. A line is tried on its own first and with a
 * forcing character second, so forcing characters only appear where the classifier needs them.
 */
function pick(el: ScriptElement, candidates: string[], after = ''): string {
  for (const c of candidates) {
    const doc = parse(`Z\n\n${c}${after}`);
    if (doc.elements.length >= 2 && sameElement(doc.elements[1], el)) return c;
  }
  return candidates[candidates.length - 1]!;
}

function lines(s: string): string[] {
  return s.split('\n');
}

function block(el: ScriptElement): string {
  const marked = () => markEmphasis(el.text, el.styles);
  switch (el.type) {
    case 'scene-heading': {
      const body = el.sceneNumber !== undefined ? `${el.text} #${el.sceneNumber}#` : el.text;
      return pick(el, [body, `.${body}`]);
    }
    case 'action':
      return pick(el, [marked(), `!${marked()}`]);
    case 'character': {
      const cue = el.dual === 'right' ? `${el.text} ^` : el.text;
      return pick(el, [cue, `@${cue}`], '\nx');
    }
    case 'parenthetical': {
      const t = marked();
      return t.startsWith('(') && t.endsWith(')') ? t : `(${t})`;
    }
    case 'dialogue':
      return marked();
    case 'transition':
      return pick(el, [el.text, `>${el.text}`]);
    case 'centered':
      return lines(marked())
        .map((l) => `>${l}<`)
        .join('\n');
    case 'lyric':
      return lines(marked())
        .map((l) => `~${l}`)
        .join('\n');
    case 'section':
      return `${'#'.repeat(el.level ?? 1)} ${el.text}`;
    case 'synopsis':
      return `= ${el.text}`;
    case 'note':
      return `[[${el.text}]]`;
    case 'boneyard':
      return `/*${el.text}*/`;
    case 'page-break':
      return '===';
  }
}

function titleBlock(e: TitleEntry): string {
  // Title values are stored as typed, emphasis markers included, so they are written as they are.
  const value = e.value.split('\n');
  return value.length === 1
    ? `${e.key}: ${value[0]}`
    : `${e.key}:\n${value.map((l) => `   ${l}`).join('\n')}`;
}

/** Writes a document as Fountain. Shared by `toFountain` and `importFdx`; never resolves anything. */
export function writeFountain(doc: ScriptDocument, escapeBraces = false): string {
  const esc = (s: string) => (escapeBraces ? s.replace(/(?<!\\)\{\{/g, '\\{{') : s);
  const render = (forceFirst: boolean): string => {
    const parts: string[] = [];
    if (doc.titlePage.length > 0)
      parts.push(doc.titlePage.map((e) => esc(titleBlock(e))).join('\n'));
    let body = '';
    let inGroup = false;
    doc.elements.forEach((el, i) => {
      let text = esc(block(el));
      if (i === 0 && forceFirst && el.type === 'action' && !text.startsWith('!')) text = `!${text}`;
      let tight = false;
      if (GROUP.has(el.type)) {
        tight = inGroup && el.type !== 'character';
        inGroup = true;
      } else if ((el.type === 'note' || el.type === 'boneyard') && inGroup) {
        tight = true;
      } else {
        inGroup = false;
      }
      body += i === 0 ? text : (tight ? '\n' : '\n\n') + text;
    });
    if (body !== '') parts.push(body);
    return parts.join('\n\n') + '\n';
  };
  const out = render(false);
  // An action whose first line looks like `Key: value` would be read as a title page.
  const first = doc.elements[0];
  if (doc.titlePage.length === 0 && first?.type === 'action' && LOOKS_LIKE_TITLE.test(out)) {
    if (parse(out).titlePage.length > 0) return render(true);
  }
  return out;
}

/**
 * Fountain text for a document. Lossless over element types and text: `parse(toFountain(parse(x)))` has
 * the same elements as `parse(x)`. Forcing characters (`!` `@` `.` `>`) are added only where a line would
 * otherwise be misread; inline notes inside an element are not kept (whole-line notes and boneyard are).
 */
export function toFountain(
  doc: ScriptDocument | ResolvedDocument,
  opts: ToFountainOptions = { dropVariables: false },
): string {
  if (!opts.dropVariables) return writeFountain(doc);
  const resolved = doc.titlePage.some((e) => e.key.startsWith(VAR_PREFIX)) ? resolve(doc).doc : doc;
  return writeFountain(resolved, true);
}
