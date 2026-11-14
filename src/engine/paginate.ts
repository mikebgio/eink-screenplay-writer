import type {
  ElementType,
  LineKind,
  Page,
  PagedScript,
  PageSpec,
  PositionedLine,
  ScriptDocument,
  ScriptElement,
  StyleSpan,
} from './types';
import { extractEmphasis } from './parse';
import {
  assignSceneNumbers,
  contdFlags,
  DEFAULT_PAGINATE_OPTIONS,
  endsSentence,
  findSentenceBreaks,
  PAGE_RULES,
  sliceStyles,
  withContd,
  type ContdEvent,
  type PaginateOptions,
} from './pageRules';

/** Courier at 12pt is 10 characters per inch and 6 lines per inch. */
export const CHARS_PER_INCH = 10;
export const LINES_PER_INCH = 6;
/** Right edge of the text area, and its centre line, in inches. */
export const RIGHT_EDGE_IN = PAGE_RULES.rightEdgeIn;
export const CENTER_IN = 4.5;
/** The page number sits 0.5 in from the top: three rows above the body area. */
export const PAGE_NUMBER_ROW = -3;

export const US_LETTER: PageSpec = {
  name: 'letter',
  widthIn: 8.5,
  heightIn: 11,
  topMarginIn: 1,
  bodyLines: 54,
};
export const A4: PageSpec = {
  name: 'a4',
  widthIn: 8.27,
  heightIn: 11.69,
  topMarginIn: 1,
  bodyLines: 58,
};

interface Layout {
  /** Left edge in inches. */
  x: number;
  /** Wrap width in characters. */
  width: number;
}

const ACTION: Layout = { x: PAGE_RULES.actionIn, width: PAGE_RULES.actionChars };
const LAYOUT: Partial<Record<ElementType, Layout>> = {
  'scene-heading': ACTION,
  action: ACTION,
  lyric: ACTION,
  centered: ACTION,
  transition: ACTION,
  character: { x: PAGE_RULES.cueIn, width: PAGE_RULES.cueChars },
  parenthetical: { x: PAGE_RULES.parentheticalIn, width: PAGE_RULES.parentheticalChars },
  dialogue: { x: PAGE_RULES.dialogueIn, width: PAGE_RULES.dialogueChars },
};
type DualColumn = typeof PAGE_RULES.dual.left | typeof PAGE_RULES.dual.right;
function dualLayout(col: DualColumn): Partial<Record<ElementType, Layout>> {
  return {
    character: { x: col.cueIn, width: col.cueChars },
    parenthetical: { x: col.parentheticalIn, width: col.parentheticalChars },
    dialogue: { x: col.dialogueIn, width: col.widthChars },
  };
}

/** Never printed: they stay in the document but take no space on the page. */
const NOT_PRINTED = new Set<ElementType>(['section', 'synopsis', 'note', 'boneyard']);
/** Types that continue a dialogue block with no blank line before them. */
const IN_DIALOGUE = new Set<ElementType>(['character', 'parenthetical', 'dialogue']);

function lineX(type: ElementType, layout: Layout, text: string): number {
  if (type === 'transition') return RIGHT_EDGE_IN - text.length / CHARS_PER_INCH;
  if (type === 'centered') return CENTER_IN - text.length / (2 * CHARS_PER_INCH);
  return layout.x;
}

interface WrappedWord {
  /** Offset in the original text. */
  start: number;
  length: number;
  /** Column in the wrapped line. */
  col: number;
}
interface WrappedLine {
  text: string;
  words: WrappedWord[];
}

/** Greedy word wrap by character count, tracking where each word came from. Over-long words are hard-split. */
function wrapWords(text: string, width: number): WrappedLine[] {
  if (!(width >= 1)) throw new RangeError(`wrap width must be >= 1, got ${width}`);
  const out: WrappedLine[] = [];
  let base = 0;
  for (const raw of text.split('\n')) {
    let cur: WrappedLine = { text: '', words: [] };
    const flush = () => {
      out.push(cur);
      cur = { text: '', words: [] };
    };
    for (const m of raw.matchAll(/\S+/g)) {
      let start = base + m.index;
      let w = m[0];
      while (w.length > width) {
        if (cur.words.length) flush();
        out.push({ text: w.slice(0, width), words: [{ start, length: width, col: 0 }] });
        w = w.slice(width);
        start += width;
      }
      if (cur.words.length === 0) {
        cur.text = w;
        cur.words.push({ start, length: w.length, col: 0 });
      } else if (cur.text.length + 1 + w.length <= width) {
        cur.words.push({ start, length: w.length, col: cur.text.length + 1 });
        cur.text += ' ' + w;
      } else {
        flush();
        cur.text = w;
        cur.words.push({ start, length: w.length, col: 0 });
      }
    }
    flush();
    base += raw.length + 1;
  }
  return out;
}

/** Greedy word wrap by character count; over-long words are hard-split. */
export function wrap(text: string, width: number): string[] {
  return wrapWords(text, width).map((l) => l.text);
}

/** Project an element's style spans onto one wrapped line (offsets into the line). */
function lineStyles(line: WrappedLine, styles: StyleSpan[] | undefined): StyleSpan[] | undefined {
  if (!styles) return undefined;
  const out: StyleSpan[] = [];
  for (const s of styles) {
    let from = -1;
    let to = -1;
    for (const w of line.words) {
      const a = Math.max(s.from, w.start);
      const b = Math.min(s.to, w.start + w.length);
      if (a >= b) continue;
      if (from < 0) from = w.col + (a - w.start);
      to = w.col + (b - w.start);
    }
    if (from >= 0) out.push({ from, to, kind: s.kind });
  }
  return out.length ? out : undefined;
}

function makeLine(
  w: WrappedLine,
  kind: LineKind,
  xIn: number,
  yLine: number,
  elementIndex: number,
  styles?: StyleSpan[],
): PositionedLine {
  const line: PositionedLine = { text: w.text, xIn, yLine, kind, elementIndex };
  const s = lineStyles(w, styles);
  if (s) line.styles = s;
  return line;
}

const TITLE_KEYS: Record<string, LineKind> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  source: 'source',
  'draft date': 'draft-date',
  contact: 'contact',
};

/** Title page (page 0): title a third of the way down, draft date and contact at the bottom left. */
function titlePage(doc: ScriptDocument, spec: PageSpec): Page | undefined {
  // Title values may carry Fountain emphasis (e.g. `_**BRICK & STEEL**_`): print it, not the markers.
  const entries = new Map<LineKind, { text: string; styles: StyleSpan[] }>();
  for (const e of doc.titlePage) {
    const kind = TITLE_KEYS[e.key.trim().toLowerCase()];
    if (kind && e.value.trim() && !entries.has(kind)) entries.set(kind, extractEmphasis(e.value));
  }
  if (entries.size === 0) return undefined;
  const lines: PositionedLine[] = [];
  const place = (kind: LineKind, row: number, left: boolean): number => {
    const value = entries.get(kind);
    if (value === undefined) return row;
    const styles = value.styles.length ? value.styles : undefined;
    for (const w of wrapWords(value.text, ACTION.width)) {
      const x = left ? ACTION.x : CENTER_IN - w.text.length / (2 * CHARS_PER_INCH);
      lines.push(makeLine(w, kind, x, row++, -1, styles));
    }
    return row;
  };
  // About a third of the way down the paper, measured from the top edge.
  let row = Math.round((spec.heightIn / 3 - spec.topMarginIn) * LINES_PER_INCH);
  for (const kind of ['title', 'credit', 'author', 'source'] as const) {
    if (!entries.has(kind)) continue;
    row = place(kind, row, false) + 1;
  }
  // The bottom block is laid out first to measure it, then anchored to the last body row.
  const bottom: LineKind[] = (['draft-date', 'contact'] as const).filter((k) => entries.has(k));
  const heights = bottom.map((k) => wrapWords(entries.get(k)!.text, ACTION.width).length);
  let r = spec.bodyLines - (heights.reduce((a, b) => a + b, 0) + Math.max(0, bottom.length - 1));
  for (const kind of bottom) r = place(kind, r, true) + 1;
  return { number: 0, lines };
}

// ---------------------------------------------------------------------------------------------
// Measurement: elements become blocks of wrapped units (pure, once per element).
// ---------------------------------------------------------------------------------------------

/** One element (or the printed part of one) with its wrapped lines. */
interface Unit {
  /** Index into `doc.elements`. */
  el: number;
  type: ElementType;
  text: string;
  styles?: StyleSpan[];
  lines: WrappedLine[];
  layout: Layout;
}

/** What the placement loop moves around: it is placed whole, split, or moved to the next page. */
interface Block {
  kind: 'break' | 'single' | 'dialogue' | 'dual';
  /** Type of the first unit. */
  type: ElementType;
  units: Unit[];
  /** Blank lines before it (dropped at the top of a page). */
  blank: 0 | 1;
  /** `dual` only: the two columns. */
  columns?: [Unit[], Unit[]];
  /** Rule 9: the number printed in both margins of a scene heading. */
  sceneNumber?: string;
  /** Rule 6: set once a transition has already pulled the previous element over. */
  noRetry?: boolean;
}

function makeUnit(
  el: ScriptElement,
  index: number,
  layout: Layout,
  text = el.text,
  styles = el.styles,
): Unit {
  const u: Unit = { el: index, type: el.type, text, lines: wrapWords(text, layout.width), layout };
  if (styles) u.styles = styles;
  return u;
}

function rewrap(u: Unit, text: string, styles: StyleSpan[] | undefined): Unit {
  const out: Unit = { ...u, text, lines: wrapWords(text, u.layout.width) };
  if (styles) out.styles = styles;
  else delete out.styles;
  return out;
}

const unitRows = (units: readonly Unit[]): number => units.reduce((n, u) => n + u.lines.length, 0);
const blockRows = (b: Block): number =>
  b.columns ? Math.max(unitRows(b.columns[0]), unitRows(b.columns[1])) : unitRows(b.units);

function buildBlocks(doc: ScriptDocument, opts: PaginateOptions): Block[] {
  const blocks: Block[] = [];
  const events: ContdEvent[] = [];
  const cueUnits: Unit[] = [];
  const headings: Block[] = [];
  const speakerOf = (el: ScriptElement) => (el.identity ?? el.text).trim().toUpperCase();

  // A whole-line note/boneyard splits its block into two elements of the same type; the second
  // half continues the first on the page, with no blank line between them.
  let prev: ScriptElement | undefined; // last printed element
  let prevEndLine = -2; // end line of the last element seen, printed or not
  let spanJoined = false; // only notes/boneyard, with no blank line, since `prev`
  let dialogue: Block | undefined; // the open character/parenthetical/dialogue block
  let dual: Block | undefined; // the open dual-dialogue pair

  doc.elements.forEach((el, index) => {
    const adjacent = el.startLine === prevEndLine + 1;
    prevEndLine = el.endLine;
    if (el.type === 'note' || el.type === 'boneyard') {
      spanJoined = (spanJoined || prev?.endLine === el.startLine - 1) && adjacent;
      return;
    }
    const continues = spanJoined && adjacent && prev?.type === el.type;
    spanJoined = false;
    if (NOT_PRINTED.has(el.type)) return;
    if (el.type === 'page-break') {
      blocks.push({ kind: 'break', type: 'page-break', units: [], blank: 0 });
      dialogue = dual = undefined;
      return;
    }
    const inDialogue =
      (el.type === 'parenthetical' || el.type === 'dialogue') &&
      prev !== undefined &&
      IN_DIALOGUE.has(prev.type) &&
      prev.endLine === el.startLine - 1;
    prev = el;

    // Rule 7: the two halves of a dual-dialogue pair become one block.
    if (el.dual && IN_DIALOGUE.has(el.type)) {
      if (!dual || (el.dual === 'left' && dual.columns![1].length > 0)) {
        dual = { kind: 'dual', type: el.type, units: [], blank: 1, columns: [[], []] };
        blocks.push(dual);
        events.push({ kind: 'other' });
      }
      const side = el.dual === 'left' ? 0 : 1;
      const col = side === 0 ? PAGE_RULES.dual.left : PAGE_RULES.dual.right;
      const layout = dualLayout(col)[el.type]!;
      dual.columns![side].push(makeUnit(el, index, layout));
      dialogue = undefined;
      return;
    }
    dual = undefined;

    const layout = LAYOUT[el.type] ?? ACTION;
    const unit = makeUnit(el, index, layout);
    if (inDialogue && dialogue) {
      dialogue.units.push(unit);
      return;
    }
    dialogue = undefined;
    const block: Block = {
      kind: el.type === 'character' ? 'dialogue' : 'single',
      type: el.type,
      units: [unit],
      blank: continues ? 0 : 1,
    };
    blocks.push(block);
    if (el.type === 'character') {
      dialogue = block;
      cueUnits.push(unit);
      events.push({ kind: 'cue', speaker: speakerOf(el) });
    } else if (el.type === 'scene-heading') {
      headings.push(block);
      events.push({ kind: 'scene' });
    } else {
      events.push({ kind: el.type === 'action' ? 'action' : 'other' });
    }
  });

  // Rule 8: automatic (CONT'D), decided once per cue and only at print time.
  if (opts.autoContd) {
    const flags = contdFlags(events);
    cueUnits.forEach((u, i) => {
      if (flags[i]) {
        const text = withContd(u.text);
        u.text = text;
        u.lines = wrapWords(text, u.layout.width);
      }
    });
  }
  // Rule 9: scene numbers.
  if (opts.sceneNumbers === 'both') {
    const forced = headings.map((h) => doc.elements[h.units[0]!.el]!.sceneNumber);
    const numbers = assignSceneNumbers(forced);
    headings.forEach((h, i) => (h.sceneNumber = numbers[i]));
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Placement: the rules decide whether a block is placed, split or moved.
// ---------------------------------------------------------------------------------------------

/** The two halves of a split block. */
interface Split {
  head: Unit[];
  tail: Unit[];
}

/** Rules 4 and 5: only dialogue blocks and plain action can be split. */
function splittable(b: Block): boolean {
  return b.kind === 'dialogue' || (b.kind === 'single' && b.type === 'action');
}

/**
 * Rules 4 and 5: the latest valid split of `b` whose first part fits in `avail` rows. A split is
 * valid at a sentence boundary when at least `minSplitLines` lines of dialogue (or action) stay and at
 * least as many move. For dialogue the first part also needs a row for `(MORE)`, and the second part
 * opens with the cue repeated as `NAME (CONT'D)`. Because a split happens only inside dialogue text or
 * after a whole dialogue element, a parenthetical can never be the last line before the break
 * (rule 3) and the cue always keeps its dialogue (rule 2).
 */
function planSplit(b: Block, avail: number): Split | undefined {
  const min = PAGE_RULES.minSplitLines;
  const isDialogue = b.kind === 'dialogue';
  const kind: ElementType = isDialogue ? 'dialogue' : 'action';
  const more = isDialogue ? 1 : 0;
  const units = b.units;
  const text = (us: readonly Unit[]) =>
    us.reduce((n, u) => (u.type === kind ? n + u.lines.length : n), 0);
  const tailWith = (rest: Unit[]): Unit[] => {
    if (!isDialogue) return rest;
    const cue = units[0]!;
    return [rewrap(cue, withContd(cue.text), undefined), ...rest];
  };
  for (let u = units.length - 1; u >= 0; u--) {
    const unit = units[u]!;
    if (unit.type !== kind) continue;
    const before = units.slice(0, u);
    const after = units.slice(u + 1);
    const beforeRows = unitRows(before);
    const beforeLines = text(before);
    const afterLines = text(after);
    // The whole element stays and the rest moves, when the element ends a sentence.
    if (after.length > 0 && endsSentence(unit.text)) {
      const headRows = beforeRows + unit.lines.length + more;
      if (headRows <= avail && beforeLines + unit.lines.length >= min && afterLines >= min) {
        return { head: [...before, unit], tail: tailWith(after) };
      }
    }
    const breaks = findSentenceBreaks(unit.text);
    for (let k = breaks.length - 1; k >= 0; k--) {
      const at = breaks[k]!;
      const headText = unit.text.slice(0, at);
      const head = rewrap(unit, headText, sliceStyles(unit.styles, 0, at));
      if (beforeRows + head.lines.length + more > avail) continue;
      if (beforeLines + head.lines.length < min) continue;
      let s = at;
      while (/\s/.test(unit.text[s]!)) s++;
      const tail = rewrap(unit, unit.text.slice(s), sliceStyles(unit.styles, s, unit.text.length));
      if (tail.lines.length + afterLines < min) continue;
      return { head: [...before, head], tail: tailWith([tail, ...after]) };
    }
  }
  return undefined;
}

/**
 * Industry pagination (ticket 06). Elements are measured into blocks, then placed one at a time on
 * pages of `spec.bodyLines` rows by the rules in `PAGE_RULES` (numbers in the rule comments are the
 * ticket's): 1 scene headings keep company, 2–5 dialogue and action split only at sentence
 * boundaries with (MORE)/(CONT'D), 6 transitions are never alone, 7 dual dialogue is one unit,
 * 8 automatic (CONT'D), 9 scene numbers, 10 `===` forces a page, 11 page numbers from page 2.
 */
export function paginate(
  doc: ScriptDocument,
  spec: PageSpec = US_LETTER,
  options: Partial<PaginateOptions> = {},
): PagedScript {
  const opts: PaginateOptions = { ...DEFAULT_PAGINATE_OPTIONS, ...options };
  const BODY = spec.bodyLines;
  const blocks = buildBlocks(doc, opts);

  const pages: Page[] = [];
  let page: Page = { number: 1, lines: [] };
  let row = 0; // next body row on the current page
  /** The last block placed on this page, with what is needed to take it back (rule 6). */
  let last: { block: Block; lineCount: number; rowBefore: number; firstRow: number } | undefined;
  /** Blocks to place before moving on: the second half of a split, and a transition waiting for it. */
  const pending: Block[] = [];
  let bi = 0;

  const startNewPage = () => {
    pages.push(page);
    page = { number: pages.length + 1, lines: [] };
    row = 0;
    last = undefined;
  };

  const emitUnits = (units: readonly Unit[], flow = false) => {
    for (const u of units) {
      for (const w of u.lines) {
        if (flow && row >= BODY) startNewPage();
        page.lines.push(makeLine(w, u.type, lineX(u.type, u.layout, w.text), row, u.el, u.styles));
        row++;
      }
    }
  };

  /** Rule 9: the scene number in both margins, on the heading's first row. */
  const emitSceneNumber = (b: Block) => {
    if (b.sceneNumber === undefined) return;
    const text = b.sceneNumber;
    const el = b.units[0]!.el;
    const { leftIn, rightEdgeIn } = PAGE_RULES.sceneNumber;
    page.lines.push({ text, xIn: leftIn, yLine: row, kind: 'scene-number', elementIndex: el });
    page.lines.push({
      text,
      xIn: rightEdgeIn - text.length / CHARS_PER_INCH,
      yLine: row,
      kind: 'scene-number',
      elementIndex: el,
    });
  };

  /** Rule 7: columns side by side from the same row; the pair is as tall as the taller column. */
  const emitDual = (b: Block, flow = false) => {
    const cols = b.columns!;
    const top = row;
    const tallest = Math.max(unitRows(cols[0]), unitRows(cols[1]));
    if (!flow) {
      for (const col of cols) {
        row = top;
        emitUnits(col);
      }
      row = top + tallest;
      return;
    }
    // Last resort for a pair taller than a page: continue row by row on the next page.
    const flat = cols.map((c) => c.flatMap((u) => u.lines.map((w) => ({ u, w }))));
    for (let r = 0; r < tallest; r++) {
      if (row >= BODY) startNewPage();
      for (const col of flat) {
        const item = col[r];
        if (item) {
          const { u, w } = item;
          page.lines.push(
            makeLine(w, u.type, lineX(u.type, u.layout, w.text), row, u.el, u.styles),
          );
        }
      }
      row++;
    }
  };

  /** Place `b` at the current row (after its blank line), whole. */
  const place = (b: Block, skipBlank = false) => {
    const rowBefore = row;
    const lineCount = page.lines.length;
    if (row > 0 && !skipBlank) row += b.blank;
    const firstRow = row;
    if (b.sceneNumber !== undefined) emitSceneNumber(b);
    if (b.columns) emitDual(b);
    else emitUnits(b.units);
    last = { block: b, lineCount, rowBefore, firstRow };
  };

  /** Rule 4/5: place the first part (with `(MORE)` for dialogue), queue the rest for the next page. */
  const placeSplit = (b: Block, s: Split) => {
    place({ ...b, units: s.head });
    if (b.kind === 'dialogue') {
      const lastUnit = s.head[s.head.length - 1]!;
      page.lines.push({
        text: PAGE_RULES.moreText,
        xIn: PAGE_RULES.cueIn,
        yLine: row,
        kind: 'more',
        elementIndex: lastUnit.el,
      });
      row++;
    }
    pending.push({ ...b, units: s.tail, blank: 0 });
    startNewPage();
  };

  /** Rule 1 look-ahead: would the block `offset` places ahead keep some content on this page from `from`? */
  const keepsCompany = (offset: number, from: number): boolean => {
    const next = blocks[bi + offset];
    if (!next || next.kind === 'break') return true;
    const rows = blockRows(next);
    const avail = BODY - from - next.blank;
    if (rows > BODY) return avail > 0;
    if (rows <= avail) {
      return next.type === 'scene-heading'
        ? keepsCompany(offset + 1, from + next.blank + rows)
        : true;
    }
    if (next.type === 'transition') return true; // rule 6 decides for itself
    return splittable(next) && planSplit(next, avail) !== undefined;
  };

  /** Rule 6: a transition that doesn't fit would start a page alone. */
  const placeTransition = (b: Block) => {
    const n = blockRows(b);
    if (row > 0 && !b.noRetry && last && splittable(last.block)) {
      const plan = planSplit(last.block, BODY - last.firstRow);
      if (plan) {
        const prev = last;
        page.lines.length = prev.lineCount;
        row = prev.rowBefore;
        pending.push({ ...b, noRetry: true });
        placeSplit(prev.block, plan);
        return;
      }
    }
    if (row + n <= BODY + PAGE_RULES.transitionOverrunLines) {
      // Keep it at the bottom: the blank line goes first if there is no room for both.
      const withBlank = row + b.blank + n <= BODY + PAGE_RULES.transitionOverrunLines;
      place(b, !withBlank);
      last = undefined;
      return;
    }
    startNewPage();
    place(b);
  };

  const placeBlock = (b: Block) => {
    for (;;) {
      const blank = row > 0 ? b.blank : 0;
      const rows = blockRows(b);
      const avail = BODY - row - blank;
      if (rows <= avail) {
        // Rule 1: a scene heading needs company on its page.
        if (b.type === 'scene-heading' && row > 0 && !keepsCompany(0, row + blank + rows)) {
          startNewPage();
          continue;
        }
        place(b);
        return;
      }
      if (b.type === 'transition' && row > 0) {
        placeTransition(b);
        return;
      }
      const plan = splittable(b) ? planSplit(b, avail) : undefined;
      if (plan) {
        placeSplit(b, plan);
        return;
      }
      if (row > 0) {
        startNewPage(); // moved whole (or, if taller than a page, to start at the top)
        continue;
      }
      // Taller than a page and no rule can split it: break at a line as a last resort.
      if (b.columns) emitDual(b, true);
      else {
        emitSceneNumber(b);
        emitUnits(b.units, true);
      }
      last = undefined;
      return;
    }
  };

  while (pending.length > 0 || bi < blocks.length) {
    const b = pending.length > 0 ? pending.pop()! : blocks[bi++]!;
    if (b.kind === 'break') {
      // Rule 10: always a new page, never an empty one.
      if (row > 0) startNewPage();
      continue;
    }
    placeBlock(b);
  }
  if (page.lines.length > 0 || pages.length === 0) pages.push(page);

  // Rule 11: page numbers from page 2, right edge at 7.5 in.
  for (const p of pages) {
    if (p.number === 1) continue;
    const text = `${p.number}.`;
    p.lines.unshift({
      text,
      xIn: RIGHT_EDGE_IN - text.length / CHARS_PER_INCH,
      yLine: PAGE_NUMBER_ROW,
      kind: 'page-number',
      elementIndex: -1,
    });
  }

  const result: PagedScript = {
    pages,
    pageCount: pages.length,
    estimatedMinutes: pages.length,
    spec,
  };
  const title = titlePage(doc, spec);
  if (title) result.titlePage = title;
  return result;
}

/** "≈ 45m" or "≈ 1h 52m". */
export function formatRunningTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `≈ ${h}h ${m}m` : `≈ ${m}m`;
}
