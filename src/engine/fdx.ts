import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { markEmphasis, writeFountain } from './fountainOut';
import { assignSceneNumbers } from './pageRules';
import type {
  ElementType,
  ResolvedDocument,
  ScriptDocument,
  ScriptElement,
  StyleSpan,
  TitleEntry,
} from './types';
import { extractEmphasis } from './parse';

/*
 * Final Draft (.fdx) export and import. Pure: no DOM, so XML is read with fast-xml-parser and written
 * as strings. Only the paragraph types Final Draft, Fade In, WriterDuet and Highland all understand are
 * written; everything else that appears in a file read here is mapped onto the same set.
 */

export interface FdxOptions {
  /** Write a `Number` on every scene heading (a forced `#12A#` is kept; the rest count 1, 2, 3…). */
  sceneNumbers?: boolean;
}

const GROUP = new Set<ElementType>(['character', 'parenthetical', 'dialogue']);

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

/** True for characters XML 1.0 can't carry (most control characters, U+FFFE and U+FFFF). */
function illegalXmlChar(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    code === 0xfffe ||
    code === 0xffff
  );
}

/** Escapes `& < > " '` and drops characters that XML 1.0 can't carry. */
function esc(s: string): string {
  let clean = '';
  for (let i = 0; i < s.length; i++) if (!illegalXmlChar(s.charCodeAt(i))) clean += s[i];
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const STYLE_NAME: Record<StyleSpan['kind'], string> = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
};
const STYLE_ORDER: StyleSpan['kind'][] = ['bold', 'italic', 'underline'];

/** `<Text>` runs, split wherever the set of active styles changes. */
function runs(text: string, styles: readonly StyleSpan[] = [], extra?: StyleSpan['kind']): string {
  const cuts = new Set<number>([0, text.length]);
  for (const s of styles) {
    cuts.add(Math.max(0, Math.min(text.length, s.from)));
    cuts.add(Math.max(0, Math.min(text.length, s.to)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const active = new Set<StyleSpan['kind']>(
      styles.filter((s) => s.from <= from && s.to >= to).map((s) => s.kind),
    );
    if (extra) active.add(extra);
    const style = STYLE_ORDER.filter((k) => active.has(k))
      .map((k) => STYLE_NAME[k])
      .join('+');
    out += `<Text${style ? ` Style="${style}"` : ''}>${esc(text.slice(from, to))}</Text>`;
  }
  return out === '' ? '<Text></Text>' : out;
}

interface ParagraphSpec {
  type?: string;
  number?: string;
  alignment?: string;
  newPage?: boolean;
  text: string;
  styles?: readonly StyleSpan[];
  italic?: boolean;
}

function paragraph(p: ParagraphSpec): string {
  const attrs =
    (p.type ? ` Type="${p.type}"` : '') +
    (p.number !== undefined ? ` Number="${esc(p.number)}"` : '') +
    (p.alignment ? ` Alignment="${p.alignment}"` : '') +
    (p.newPage ? ' StartsNewPage="Yes"' : '');
  return `<Paragraph${attrs}>${runs(p.text, p.styles, p.italic ? 'italic' : undefined)}</Paragraph>`;
}

const findEntry = (doc: ScriptDocument, key: string): TitleEntry | undefined =>
  doc.titlePage.find((e) => e.key.trim().toLowerCase() === key.toLowerCase());

/** The title page as Final Draft lays it out: centred title, credit, author, source; date right; contact left. */
function titlePageXml(doc: ScriptDocument): string {
  const blank = (alignment: string, n: number) =>
    `      <Paragraph Alignment="${alignment}"/>\n`.repeat(n);
  const lines = (key: string, alignment: string): string => {
    const value = findEntry(doc, key)?.value.trim();
    if (!value) return '';
    return value
      .split('\n')
      .map((line) => {
        const e = extractEmphasis(line.trim());
        return `      ${paragraph({ alignment, text: e.text, styles: e.styles })}\n`;
      })
      .join('');
  };
  const centred = ['Title', 'Credit', 'Author', 'Source']
    .map((k) => lines(k, 'Center'))
    .filter((s) => s !== '');
  const date = lines('Draft date', 'Right');
  const contact = lines('Contact', 'Left');
  if (centred.length === 0 && !date && !contact) return '';
  let body = blank('Center', 10) + centred.join(blank('Center', 2));
  if (date || contact) body += blank('Left', 8);
  body += date + (date && contact ? blank('Left', 1) : '') + contact;
  return `  <TitlePage>\n    <Content>\n${body}    </Content>\n  </TitlePage>\n`;
}

/**
 * Final Draft XML for a resolved document. Element mapping: scene heading, action, character,
 * parenthetical, dialogue and transition map one to one; centred text is an Action with
 * `Alignment="Center"`; a lyric is italic Dialogue; a page break becomes `StartsNewPage="Yes"` on the next
 * paragraph; both halves of dual dialogue go in one `DualDialogue` paragraph. Sections, synopses, notes
 * and boneyard are not written. Emphasis becomes `Style` runs (`Bold+Italic`, …).
 */
export function exportFdx(resolved: ResolvedDocument, opts: FdxOptions = {}): string {
  const els = resolved.elements;
  const numbers = opts.sceneNumbers
    ? assignSceneNumbers(els.filter((e) => e.type === 'scene-heading').map((e) => e.sceneNumber))
    : [];
  let heading = 0;
  let newPage = false;
  const out: string[] = [];

  const one = (el: ScriptElement): string | null => {
    let spec: ParagraphSpec;
    switch (el.type) {
      case 'scene-heading':
        spec = {
          type: 'Scene Heading',
          text: el.text,
          number: opts.sceneNumbers ? numbers[heading] : undefined,
        };
        heading++;
        break;
      case 'action':
        spec = { type: 'Action', text: el.text, styles: el.styles };
        break;
      case 'centered':
        spec = { type: 'Action', alignment: 'Center', text: el.text, styles: el.styles };
        break;
      case 'character':
        spec = { type: 'Character', text: el.text };
        break;
      case 'parenthetical':
        spec = { type: 'Parenthetical', text: el.text, styles: el.styles };
        break;
      case 'dialogue':
        spec = { type: 'Dialogue', text: el.text, styles: el.styles };
        break;
      case 'lyric':
        spec = { type: 'Dialogue', text: el.text, styles: el.styles, italic: true };
        break;
      case 'transition':
        spec = { type: 'Transition', text: el.text };
        break;
      case 'page-break':
        newPage = true;
        return null;
      default:
        return null; // section, synopsis, note, boneyard
    }
    spec.newPage = newPage;
    newPage = false;
    return paragraph(spec);
  };

  for (let i = 0; i < els.length; i++) {
    const el = els[i]!;
    if (GROUP.has(el.type) && el.dual === 'left') {
      // Collect both halves of the pair.
      const members: ScriptElement[] = [];
      let seenRight = false;
      let j = i;
      for (; j < els.length; j++) {
        const m = els[j]!;
        if (m.type === 'note' || m.type === 'boneyard') continue;
        if (!GROUP.has(m.type) || !m.dual) break;
        if (m.dual === 'right') seenRight = true;
        else if (seenRight) break;
        members.push(m);
      }
      const inner = members.map(one).filter((x): x is string => x !== null);
      out.push(`<Paragraph><DualDialogue>${inner.join('')}</DualDialogue></Paragraph>`);
      i = j - 1;
      continue;
    }
    const p = one(el);
    if (p !== null) out.push(p);
  }

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
    '<FinalDraft DocumentType="Script" Template="No" Version="5">\n' +
    '  <Content>\n' +
    out.map((p) => `    ${p}\n`).join('') +
    '  </Content>\n' +
    titlePageXml(resolved) +
    '</FinalDraft>\n'
  );
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: (XNode | string)[];
}

type RawItem = Record<string, unknown>;

function toTree(items: unknown): (XNode | string)[] {
  if (!Array.isArray(items)) return [];
  const out: (XNode | string)[] = [];
  for (const item of items as RawItem[]) {
    if ('#text' in item) {
      out.push(String(item['#text']));
      continue;
    }
    const name = Object.keys(item).find((k) => k !== ':@');
    if (name === undefined) continue;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      (item[':@'] as Record<string, unknown> | undefined) ?? {},
    )) {
      attrs[k] = String(v);
    }
    out.push({ name, attrs, children: toTree(item[name]) });
  }
  return out;
}

const kids = (n: XNode, name: string): XNode[] =>
  n.children.filter((c): c is XNode => typeof c !== 'string' && c.name === name);

const NOT_FDX = 'This is not a Final Draft (.fdx) file.';

function parseXml(xml: string): XNode {
  if (XMLValidator.validate(xml) !== true) throw new Error(NOT_FDX);
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    // Also decodes numeric references such as &#39; (the default decoder only knows the five XML names).
    htmlEntities: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
  });
  const root = toTree(parser.parse(xml)).find((n): n is XNode => typeof n !== 'string');
  if (!root || root.name !== 'FinalDraft') throw new Error(NOT_FDX);
  return root;
}

interface Para {
  type: string;
  attrs: Record<string, string>;
  text: string;
  styles: StyleSpan[];
  /** Child paragraphs of a `DualDialogue` wrapper. */
  dual?: Para[];
}

function readStyles(style: string | undefined): StyleSpan['kind'][] {
  const out: StyleSpan['kind'][] = [];
  for (const part of (style ?? '').split('+')) {
    const k = part.trim().toLowerCase();
    if (k === 'bold' || k === 'italic' || k === 'underline') out.push(k);
  }
  return out;
}

function readParagraph(n: XNode): Para {
  const dualNode = kids(n, 'DualDialogue')[0];
  if (dualNode) {
    return {
      type: '',
      attrs: n.attrs,
      text: '',
      styles: [],
      dual: kids(dualNode, 'Paragraph').map(readParagraph),
    };
  }
  let text = '';
  const styles: StyleSpan[] = [];
  for (const t of kids(n, 'Text')) {
    const value = t.children.filter((c): c is string => typeof c === 'string').join('');
    const from = text.length;
    text += value;
    for (const kind of readStyles(t.attrs.Style)) styles.push({ from, to: text.length, kind });
  }
  text = text.replace(/\r\n?/g, '\n');
  return { type: n.attrs.Type ?? '', attrs: n.attrs, text, styles: mergeStyles(styles) };
}

/** Joins touching spans of one kind (runs split for other reasons). */
function mergeStyles(spans: StyleSpan[]): StyleSpan[] {
  const out: StyleSpan[] = [];
  for (const s of spans.slice().sort((a, b) => a.from - b.from)) {
    const prev = [...out].reverse().find((o) => o.kind === s.kind && o.to === s.from);
    if (prev) prev.to = s.to;
    else out.push({ ...s });
  }
  return out;
}

interface Piece {
  text: string;
  styles: StyleSpan[];
}

/**
 * Trims every line, drops empty ones and keeps the style spans lined up with the cleaned text. With
 * `split`, blank lines separate pieces instead of being dropped.
 */
function tidy(full: string, spans: readonly StyleSpan[], split: boolean): Piece[] {
  const groups: string[][] = [[]];
  const offsets: number[][] = [[]];
  let pos = 0;
  for (const line of full.split('\n')) {
    if (line.trim() === '') {
      if (split && groups[groups.length - 1]!.length > 0) {
        groups.push([]);
        offsets.push([]);
      }
    } else {
      groups[groups.length - 1]!.push(line);
      offsets[offsets.length - 1]!.push(pos);
    }
    pos += line.length + 1;
  }
  const pieces: Piece[] = [];
  groups.forEach((g, gi) => {
    if (g.length === 0) return;
    const map = new Map<number, number>(); // source offset -> offset in the cleaned text
    let text = '';
    g.forEach((line, li) => {
      if (li > 0) text += '\n';
      const start = offsets[gi]![li]!;
      const lead = line.length - line.trimStart().length;
      const trimmed = line.trim();
      for (let k = 0; k <= line.length; k++) {
        map.set(start + k, text.length + Math.max(0, Math.min(trimmed.length, k - lead)));
      }
      text += trimmed;
    });
    const first = offsets[gi]![0]!;
    const lastLine = g[g.length - 1]!;
    const end = offsets[gi]![g.length - 1]! + lastLine.length;
    const styles: StyleSpan[] = [];
    for (const s of spans) {
      if (s.to <= first || s.from >= end) continue;
      let a = map.get(Math.max(s.from, first)) ?? 0;
      let b = map.get(Math.min(s.to, end)) ?? text.length;
      // Fountain markers can't touch whitespace, so a run like "_ one_" is trimmed to "one".
      while (a < b && /\s/.test(text[a]!)) a++;
      while (b > a && /\s/.test(text[b - 1]!)) b--;
      if (b > a) styles.push({ from: a, to: b, kind: s.kind });
    }
    pieces.push({ text, styles });
  });
  return pieces;
}

function element(
  type: ElementType,
  text: string,
  extra: Partial<ScriptElement> = {},
): ScriptElement {
  return { type, text, raw: '', from: 0, to: 0, startLine: 0, endLine: 0, ...extra };
}

const isCapitalised = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
const PLAIN_TEXT = new Set<ElementType>(['scene-heading', 'character', 'transition']);

function importBody(paras: Para[]): ScriptElement[] {
  const out: ScriptElement[] = [];
  let inGroup = false;

  const add = (p: Para, dual?: 'left' | 'right'): void => {
    if (p.dual) return;
    let type: ElementType;
    const t = p.type;
    switch (t) {
      case 'Scene Heading':
        type = 'scene-heading';
        break;
      case 'Character':
        type = 'character';
        break;
      case 'Parenthetical':
        type = inGroup ? 'parenthetical' : 'action';
        break;
      case 'Dialogue':
        type = inGroup ? 'dialogue' : 'lyric';
        break;
      case 'Transition':
        type = 'transition';
        break;
      case 'Shot':
        type = isCapitalised(p.text.trim()) ? 'scene-heading' : 'action';
        break;
      default:
        type = p.attrs.Alignment === 'Center' ? 'centered' : 'action';
    }
    const pieces = tidy(p.text, p.styles, type === 'action' || type === 'centered');
    if (pieces.length === 0) return; // empty paragraphs only add spacing in Final Draft
    if (p.attrs.StartsNewPage === 'Yes' && out.length > 0) out.push(element('page-break', ''));
    if (type === 'character') inGroup = true;
    else if (type !== 'parenthetical' && type !== 'dialogue') inGroup = false;
    for (const piece of pieces) {
      let styles = piece.styles;
      if (type === 'lyric') {
        // A lyric is written as italic Dialogue; take that italic back off.
        styles = styles.filter(
          (s) => !(s.kind === 'italic' && s.from === 0 && s.to === piece.text.length),
        );
      }
      const el = element(type, piece.text);
      if (!PLAIN_TEXT.has(type) && styles.length > 0) el.styles = styles;
      if (type === 'scene-heading' && p.attrs.Number) el.sceneNumber = p.attrs.Number;
      if (dual && GROUP.has(type)) el.dual = dual;
      out.push(el);
    }
  };

  for (const p of paras) {
    if (p.dual) {
      inGroup = false;
      let side: 'left' | 'right' = 'left';
      let characters = 0;
      const members = p.dual;
      members.forEach((m) => {
        if (m.type === 'Character') characters++;
      });
      for (const m of members) {
        if (m.type === 'Character') {
          if (characters >= 2 && inGroup) side = 'right';
          inGroup = true;
        }
        add(m, characters >= 2 ? side : undefined);
      }
      inGroup = false;
    } else {
      add(p);
    }
  }
  return out;
}

interface TitleGroup {
  align: string;
  lines: string[];
}

const CREDIT = /\b(written|by)\b/i;

function importTitlePage(paras: Para[]): TitleEntry[] {
  const groups: TitleGroup[] = [];
  let cur: TitleGroup | null = null;
  for (const p of paras) {
    const pieces = tidy(p.text, p.styles, false);
    if (pieces.length === 0) {
      cur = null;
      continue;
    }
    const align = p.attrs.Alignment ?? 'Left';
    if (!cur || cur.align !== align) {
      cur = { align, lines: [] };
      groups.push(cur);
    }
    for (const piece of pieces) {
      cur.lines.push(...markEmphasis(piece.text, piece.styles).split('\n'));
    }
  }
  const value = (g: TitleGroup[]) => g.flatMap((x) => x.lines).join('\n');
  const entries: TitleEntry[] = [];
  const set = (key: string, v: string) => {
    if (v !== '') entries.push({ key, value: v });
  };

  const centred = groups.filter((g) => g.align === 'Center');
  const right = groups.filter((g) => g.align === 'Right');
  const left = groups.filter((g) => g.align !== 'Center' && g.align !== 'Right');

  // Best guess from layout: the first centred block is the title, one mentioning "by" or "written" is
  // the credit, then author and source; anything further goes to Notes.
  let title = '';
  let credit = '';
  let author = '';
  let source = '';
  const notes: TitleGroup[] = [];
  centred.forEach((g, i) => {
    const v = g.lines.join('\n');
    if (i === 0) title = v;
    else if (credit === '' && author === '' && CREDIT.test(g.lines[0]!)) credit = v;
    else if (author === '') author = v;
    else if (source === '') source = v;
    else notes.push(g);
  });
  set('Title', title);
  set('Credit', credit);
  set('Author', author);
  set('Source', source);
  if (notes.length > 0) set('Notes', value(notes));

  let draftDate = value(right);
  let copyright = '';
  let contact = '';
  if (right.length > 0 || left.length === 1) {
    contact = value(left);
  } else if (left.length === 2) {
    draftDate = value(left.slice(0, 1));
    contact = value(left.slice(1));
  } else if (left.length >= 3) {
    copyright = value(left.slice(0, left.length - 2));
    draftDate = value(left.slice(-2, -1));
    contact = value(left.slice(-1));
  }
  set('Copyright', copyright);
  set('Draft date', draftDate);
  set('Contact', contact);
  return entries;
}

/**
 * Converts the text of a Final Draft file into Fountain. Reads only the script and the title page;
 * paragraph types Fountain has no use for (General, Cast List, Shot, …) become action, or, for a
 * capitalised Shot, a scene heading. Lines the classifier would misread get forcing characters.
 * Throws if `xml` is not a Final Draft document.
 */
export function importFdx(xml: string): string {
  const root = parseXml(xml);
  const content = kids(root, 'Content')[0];
  const paras = content ? kids(content, 'Paragraph').map(readParagraph) : [];
  const titleContent = kids(
    kids(root, 'TitlePage')[0] ?? { name: '', attrs: {}, children: [] },
    'Content',
  )[0];
  const titleParas = titleContent ? kids(titleContent, 'Paragraph').map(readParagraph) : [];

  const doc: ScriptDocument = {
    titlePage: importTitlePage(titleParas),
    elements: importBody(paras),
  };
  return writeFountain(doc);
}
