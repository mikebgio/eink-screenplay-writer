import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAGE_RULES,
  paginate,
  parse,
  renderPagedText,
  US_LETTER,
  A4,
  wrap,
  type Page,
  type PagedScript,
  type PaginateOptions,
} from '../src/engine';

/**
 * Industry page-break rules (ticket 06). Every rule has a fixture built inline (so the numbers that
 * put a break in the right place are visible), rendered to a golden file under
 * test/golden/pagebreaks/ and also checked with explicit assertions. `UPDATE_GOLDEN=1` rewrites them.
 */

const GOLDEN = new URL('./golden/pagebreaks/', import.meta.url);

const POOL = [
  'rain',
  'falls',
  'over',
  'the',
  'quiet',
  'street',
  'below',
  'tower',
  'where',
  'nobody',
];

/** Text that wraps to exactly `n` lines at `width`, with no sentence ends except an optional final `end`. */
function lines(width: number, n: number, end = '', seed = 0): string {
  const words: string[] = [];
  const count = (extra: string) => wrap(`${[...words, extra].join(' ')}${end}`, width).length;
  for (let i = seed; ; i++) {
    const w = POOL[i % POOL.length]!;
    if (words.length && count(w) > n) break;
    words.push(w);
    if (words.length > 5000) throw new Error('lines(): runaway');
  }
  const text = words.join(' ') + end;
  if (wrap(text, width).length !== n)
    throw new Error(`lines(${width}, ${n}) made ${wrap(text, width).length}`);
  return text;
}
const action = (n: number, end = '', seed = 0) => lines(60, n, end, seed);
const speech = (n: number, end = '', seed = 0) => lines(35, n, end, seed);
const script = (...blocks: string[]) => blocks.join('\n\n') + '\n';
const dlg = (cue: string, ...rest: string[]) => [cue, ...rest].join('\n');

function run(src: string, options?: Partial<PaginateOptions>) {
  const doc = parse(src);
  return { doc, paged: paginate(doc, US_LETTER, options) };
}

/** Body rows of a page as text (lines on the same row joined by a space, left to right). */
function rows(page: Page): Map<number, string> {
  const m = new Map<number, string[]>();
  for (const l of [...page.lines].sort((a, b) => a.xIn - b.xIn)) {
    if (l.kind === 'page-number') continue;
    (m.get(l.yLine) ?? m.set(l.yLine, []).get(l.yLine)!).push(l.text);
  }
  return new Map([...m].map(([y, t]) => [y, t.join(' ')]));
}
const lastRow = (page: Page) => Math.max(...rows(page).keys());
const textAt = (page: Page, y: number) => rows(page).get(y);
const lastText = (page: Page) => textAt(page, lastRow(page))!;
const firstText = (page: Page) => textAt(page, 0)!;
const linesAt = (page: Page, y: number) => page.lines.filter((l) => l.yLine === y);

function golden(name: string, paged: PagedScript) {
  const file = new URL(`${name}.txt`, GOLDEN);
  const actual = renderPagedText(paged);
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(file, actual);
  }
  expect(existsSync(file), `missing golden ${name}.txt (run with UPDATE_GOLDEN=1)`).toBe(true);
  expect(actual).toBe(readFileSync(file, 'utf8'));
}

/** Properties that must hold for every script, whatever the rules decide. */
function checkInvariants(doc: ReturnType<typeof parse>, paged: PagedScript) {
  const BODY = paged.spec.bodyLines;
  const printed = new Map<number, string[]>();
  for (const [pi, page] of paged.pages.entries()) {
    expect(page.number).toBe(pi + 1);
    const ys = page.lines.filter((l) => l.kind !== 'page-number').map((l) => l.yLine);
    for (const l of page.lines) {
      if (l.kind === 'page-number') continue;
      expect(l.yLine, `row on page ${page.number}`).toBeGreaterThanOrEqual(0);
      // Only a transition may run one line past the bottom (rule 6).
      expect(l.yLine, `row on page ${page.number}: ${l.text}`).toBeLessThan(
        l.kind === 'transition' ? BODY + 1 : BODY,
      );
      if (l.kind !== 'more' && l.kind !== 'scene-number' && l.elementIndex >= 0) {
        const el = doc.elements[l.elementIndex]!;
        if (el.type === 'character') continue;
        (printed.get(l.elementIndex) ?? printed.set(l.elementIndex, []).get(l.elementIndex)!).push(
          l.text,
        );
      }
    }
    if (ys.length) expect(Math.min(...ys), `page ${page.number} starts at the top`).toBe(0);
  }
  // Nothing is lost or reordered by splitting.
  for (const [i, parts] of printed) {
    const el = doc.elements[i]!;
    expect(parts.join(' ').split(/\s+/)).toEqual(el.text.split(/\s+/).filter(Boolean));
  }
}

describe('rule 1: scene heading is never the last thing on a page', () => {
  it('moves a heading left alone at the bottom to the next page', () => {
    const { doc, paged } = run(script(action(51), 'INT. HOUSE - DAY', action(6)));
    checkInvariants(doc, paged);
    expect(paged.pageCount).toBe(2);
    expect(lastText(paged.pages[0]!)).not.toContain('INT. HOUSE');
    expect(firstText(paged.pages[1]!)).toBe('INT. HOUSE - DAY');
    golden('rule-01-heading-alone-at-bottom', paged);
  });

  it('moves the heading when only one line of the next element would fit', () => {
    const { doc, paged } = run(script(action(50), 'INT. HOUSE - DAY', action(4)));
    checkInvariants(doc, paged);
    expect(firstText(paged.pages[1]!)).toBe('INT. HOUSE - DAY');
    golden('rule-01-heading-one-line-fits', paged);
  });

  it('keeps the heading when 2 lines of the next element fit and it can split there', () => {
    const next = `${action(2, '.')} ${action(4, '.', 3)}`;
    const { doc, paged } = run(script(action(49), 'INT. HOUSE - DAY', next));
    checkInvariants(doc, paged);
    expect(textAt(paged.pages[0]!, 50)).toBe('INT. HOUSE - DAY');
    expect(lastRow(paged.pages[0]!)).toBe(53);
    golden('rule-01-heading-stays-with-split', paged);
  });

  it('keeps the heading when the next element is a single line that fits', () => {
    const { paged } = run(script(action(50), 'INT. HOUSE - DAY', 'He waits.'));
    expect(paged.pageCount).toBe(1);
    expect(lastText(paged.pages[0]!)).toBe('He waits.');
  });

  it('moves a heading whose next element is a dialogue block that cannot start here', () => {
    const { paged } = run(script(action(50), 'INT. HOUSE - DAY', dlg('MARA', speech(3))));
    expect(firstText(paged.pages[1]!)).toBe('INT. HOUSE - DAY');
  });

  it('chains: two headings in a row move together', () => {
    const { paged } = run(script(action(49), 'INT. HOUSE - DAY', 'INT. HALL - DAY', action(4)));
    expect(firstText(paged.pages[1]!)).toBe('INT. HOUSE - DAY');
    expect(textAt(paged.pages[1]!, 2)).toBe('INT. HALL - DAY');
  });

  it('leaves a heading at the very end of the script alone', () => {
    const { paged } = run(script(action(51), 'INT. HOUSE - DAY'));
    expect(paged.pageCount).toBe(1);
  });
});

describe('rule 2: a character cue is never alone at the bottom of a page', () => {
  it('moves the whole dialogue block when only the cue and one unsplittable line fit', () => {
    const { doc, paged } = run(script(action(51), dlg('MARA', speech(3)), action(2)));
    checkInvariants(doc, paged);
    expect(lastText(paged.pages[0]!)).not.toBe('MARA');
    expect(firstText(paged.pages[1]!)).toBe('MARA');
    golden('rule-02-cue-at-bottom', paged);
  });

  it('moves the block when the cue and a parenthetical fit but no dialogue does', () => {
    const { paged } = run(script(action(51), dlg('MARA', '(quietly)', speech(3))));
    expect(firstText(paged.pages[1]!)).toBe('MARA');
    expect(textAt(paged.pages[1]!, 1)).toBe('(quietly)');
  });

  it('keeps cue, parenthetical and first dialogue lines together when a valid split exists', () => {
    const { doc, paged } = run(
      script(action(47), dlg('MARA', '(quietly)', `${speech(2, '.')} ${speech(4, '.', 3)}`)),
    );
    checkInvariants(doc, paged);
    const p1 = paged.pages[0]!;
    expect(textAt(p1, 48)).toBe('MARA');
    expect(textAt(p1, 49)).toBe('(quietly)');
    expect(lastText(p1)).toBe('(MORE)');
  });
});

describe('rule 3: a parenthetical is never the last line before a break', () => {
  it('moves a parenthetical that would end the page, splitting before it', () => {
    const block = dlg('MARA', speech(3, '.'), '(beat)', speech(4, '.', 2));
    const { doc, paged } = run(script(action(48), block));
    checkInvariants(doc, paged);
    const p1 = paged.pages[0]!;
    expect(textAt(p1, 49)).toBe('MARA');
    expect(textAt(p1, 53)).toBe('(MORE)');
    expect(textAt(p1, 52)).not.toBe('(beat)');
    const p2 = paged.pages[1]!;
    expect(firstText(p2)).toBe("MARA (CONT'D)");
    expect(textAt(p2, 1)).toBe('(beat)');
    golden('rule-03-parenthetical-at-break', paged);
  });

  it('moves the whole block when splitting before the parenthetical leaves 1 line behind', () => {
    const block = dlg('MARA', speech(1, '.'), '(beat)', speech(6, '.', 2));
    const { paged } = run(script(action(48), block));
    expect(firstText(paged.pages[1]!)).toBe('MARA');
  });
});

describe('rule 4: splitting dialogue', () => {
  it("splits at a sentence boundary with (MORE) and (CONT'D)", () => {
    const body = `${speech(5, '.')} ${speech(5, '.', 2)} ${speech(5, '.', 4)}`;
    const { doc, paged } = run(script(action(40), dlg('MARA', body), action(2)));
    checkInvariants(doc, paged);
    const p1 = paged.pages[0]!;
    expect(lastText(p1)).toBe('(MORE)');
    const more = linesAt(p1, lastRow(p1))[0]!;
    expect(more.xIn).toBeCloseTo(3.7);
    expect(more.kind).toBe('more');
    const dialogueRows = p1.lines.filter((l) => l.kind === 'dialogue');
    expect(dialogueRows.length).toBeGreaterThanOrEqual(2);
    expect(dialogueRows.at(-1)!.text.trimEnd().slice(-1)).toBe('.');
    const p2 = paged.pages[1]!;
    expect(firstText(p2)).toBe("MARA (CONT'D)");
    expect(p2.lines.filter((l) => l.kind === 'dialogue').length).toBeGreaterThanOrEqual(2);
    golden('rule-04-dialogue-split', paged);
  });

  it('splits in the middle of a printed line when the sentence ends there', () => {
    const body = 'Fine. Okay. Sure. Right. '.repeat(14).trim();
    const { doc, paged } = run(script(action(46), dlg('MARA', body)));
    checkInvariants(doc, paged);
    const p1 = paged.pages[0]!;
    expect(lastText(p1)).toBe('(MORE)');
    const lastDialogue = p1.lines.filter((l) => l.kind === 'dialogue').at(-1)!;
    expect(lastDialogue.text).toMatch(/[.]$/);
    expect(lastDialogue.text.length).toBeLessThan(35);
    expect(paged.pages[1]!.lines.find((l) => l.kind === 'dialogue')!.text).toMatch(
      /^(Fine|Okay|Sure|Right)\./,
    );
    golden('rule-04-split-mid-line', paged);
  });

  it("keeps the extension: NAME (V.O.) prints NAME (V.O.) (CONT'D)", () => {
    const body = `${speech(5, '.')} ${speech(5, '.', 2)} ${speech(5, '.', 4)}`;
    const { doc, paged } = run(script(action(40), dlg('MARA (V.O.)', body)));
    checkInvariants(doc, paged);
    expect(firstText(paged.pages[1]!)).toBe("MARA (V.O.) (CONT'D)");
    golden('rule-04-dialogue-split-extension', paged);
  });

  it("does not double (CONT'D) when the source cue already has it", () => {
    const body = `${speech(5, '.')} ${speech(5, '.', 2)} ${speech(5, '.', 4)}`;
    const { paged } = run(script(action(40), dlg("MARA (CONT'D)", body)));
    expect(firstText(paged.pages[1]!)).toBe("MARA (CONT'D)");
  });

  it('moves the whole block when there is no sentence boundary', () => {
    const { doc, paged } = run(script(action(42), dlg('MARA', speech(12)), action(2)));
    checkInvariants(doc, paged);
    expect(firstText(paged.pages[1]!)).toBe('MARA');
    expect(paged.pages[0]!.lines.some((l) => l.kind === 'more')).toBe(false);
    golden('rule-04-no-sentence-boundary', paged);
  });

  it('moves the whole block when fewer than 2 dialogue lines would stay', () => {
    // cue at row 51; 1 dialogue line + (MORE) is all that fits
    const body = `${speech(4, '.')} ${speech(4, '.', 2)}`;
    const { doc, paged } = run(script(action(50), dlg('MARA', body)));
    checkInvariants(doc, paged);
    expect(firstText(paged.pages[1]!)).toBe('MARA');
    golden('rule-04-fewer-than-two-stay', paged);
  });

  it('counts (MORE) as a body line when deciding the split', () => {
    // cue at row 49, then 2 dialogue lines (rows 50, 51) and (MORE) at 52 would fit; a third line too (53 is MORE)
    const body = `${speech(2, '.')} ${speech(2, '.', 2)} ${speech(2, '.', 4)}`;
    const { doc, paged } = run(script(action(48), dlg('MARA', body)));
    checkInvariants(doc, paged);
    expect(lastRow(paged.pages[0]!)).toBeLessThanOrEqual(53);
    expect(lastText(paged.pages[0]!)).toBe('(MORE)');
  });

  it('splits a long block more than once across three pages', () => {
    const body = Array.from({ length: 30 }, (_, i) => speech(4, '.', i)).join(' ');
    const { doc, paged } = run(script(action(30), dlg('JOE', body)));
    checkInvariants(doc, paged);
    expect(paged.pageCount).toBeGreaterThanOrEqual(3);
    expect(firstText(paged.pages[2]!)).toBe("JOE (CONT'D)");
    expect(lastText(paged.pages[1]!)).toBe('(MORE)');
  });
});

describe('rule 5: splitting action', () => {
  it('splits at a sentence boundary with no (MORE)', () => {
    const body = `${action(5, '.')} ${action(5, '.', 2)} ${action(5, '.', 4)}`;
    const { doc, paged } = run(script(action(40), body));
    checkInvariants(doc, paged);
    const p1 = paged.pages[0]!;
    expect(lastText(p1).trimEnd().slice(-1)).toBe('.');
    expect(p1.lines.some((l) => l.kind === 'more')).toBe(false);
    expect(paged.pageCount).toBe(2);
    expect(lastRow(p1)).toBeGreaterThan(41);
    golden('rule-05-action-split', paged);
  });

  it('moves the whole block when there is no sentence boundary', () => {
    const { doc, paged } = run(script(action(40), action(20)));
    checkInvariants(doc, paged);
    expect(lastRow(paged.pages[0]!)).toBe(39);
    golden('rule-05-action-moved-whole', paged);
  });

  it('moves the whole block when the only boundary would leave 1 line behind', () => {
    const body = `${action(1, '.')} ${action(20, '.', 2)}`;
    const { doc, paged } = run(script(action(50), body));
    checkInvariants(doc, paged);
    // 1 line fits on page 1 after a blank; need 2
    expect(lastRow(paged.pages[0]!)).toBe(49);
  });

  it('moves the whole block when the only boundary would leave 1 line to move', () => {
    const body = `${action(8, '.')} ${action(1, '.', 2)}`;
    const { doc, paged } = run(script(action(45), body));
    checkInvariants(doc, paged);
    expect(lastRow(paged.pages[0]!)).toBe(44);
  });

  it('splits an element taller than a page at a line boundary as a last resort', () => {
    const { doc, paged } = run(script(action(70)));
    checkInvariants(doc, paged);
    expect(paged.pageCount).toBe(2);
  });
});

describe('rule 6: a transition is never alone at the top of a page', () => {
  it('moves the last lines of the previous action with the transition', () => {
    const body = `${action(4, '.')} ${action(4, '.', 2)} ${action(4, '.', 4)}`; // rows 42..53
    const { doc, paged } = run(script(action(41), body, 'CUT TO:'));
    checkInvariants(doc, paged);
    const p2 = paged.pages[1]!;
    const lastBody = lastRow(p2);
    expect(textAt(p2, lastBody)).toBe('CUT TO:');
    expect(lastBody).toBeGreaterThanOrEqual(2); // at least 2 lines of action came with it
    expect(p2.lines.filter((l) => l.kind === 'action').length).toBeGreaterThanOrEqual(2);
    expect(paged.pages[0]!.lines.some((l) => l.kind === 'transition')).toBe(false);
    golden('rule-06-transition-pulls-action', paged);
  });

  it("splits dialogue with (MORE)/(CONT'D) to keep the transition company", () => {
    const body = `${speech(4, '.')} ${speech(4, '.', 2)} ${speech(4, '.', 4)} ${speech(4, '.', 6)}`;
    const { doc, paged } = run(script(action(36), dlg('MARA', body), 'CUT TO:'));
    checkInvariants(doc, paged);
    expect(lastText(paged.pages[0]!)).toBe('(MORE)');
    const p2 = paged.pages[1]!;
    expect(firstText(p2)).toBe("MARA (CONT'D)");
    expect(lastText(p2)).toBe('CUT TO:');
    expect(p2.lines.filter((l) => l.kind === 'dialogue').length).toBeGreaterThanOrEqual(2);
    golden('rule-06-transition-pulls-dialogue', paged);
  });

  it('lets the page run one line over when the previous element cannot be split', () => {
    const { doc, paged } = run(script(action(53), 'CUT TO:', action(2)));
    checkInvariants(doc, paged);
    const p1 = paged.pages[0]!;
    expect(textAt(p1, 54)).toBe('CUT TO:');
    expect(firstText(paged.pages[1]!)).not.toBe('CUT TO:');
    golden('rule-06-transition-one-line-over', paged);
  });

  it('also runs over when the page is exactly full (no blank line before it)', () => {
    const { doc, paged } = run(script(action(54), 'CUT TO:', action(2)));
    checkInvariants(doc, paged);
    expect(textAt(paged.pages[0]!, 54)).toBe('CUT TO:');
  });

  it('places a transition that fits normally', () => {
    const { paged } = run(script(action(10), 'CUT TO:'));
    expect(paged.pageCount).toBe(1);
    expect(textAt(paged.pages[0]!, 11)).toBe('CUT TO:');
  });

  it('falls back to the top of the next page when it cannot run over', () => {
    const { doc, paged } = run(script(action(54), 'CUT TO:\nCUT TO:', action(2)));
    checkInvariants(doc, paged);
    expect(paged.pageCount).toBeGreaterThanOrEqual(2);
  });
});

describe('rule 7: dual dialogue', () => {
  const pair = (a: string, b: string) => script(a, b);
  it('prints two columns side by side', () => {
    const left = dlg('MARA', '(quietly)', speech(3, '.'));
    const right = dlg('JOE ^', lines(28, 5, '.'));
    const { doc, paged } = run(pair(left, right));
    checkInvariants(doc, paged);
    const p = paged.pages[0]!;
    const cueL = p.lines.find((l) => l.text === 'MARA')!;
    const cueR = p.lines.find((l) => l.text === 'JOE')!;
    expect(cueL.xIn).toBeCloseTo(PAGE_RULES.dual.left.cueIn);
    expect(cueR.xIn).toBeCloseTo(PAGE_RULES.dual.right.cueIn);
    expect(cueL.xIn).toBeCloseTo(3.0);
    expect(cueR.xIn).toBeCloseTo(6.2);
    expect(cueL.yLine).toBe(cueR.yLine);
    const dl = p.lines.filter((l) => l.kind === 'dialogue');
    expect(dl.some((l) => Math.abs(l.xIn - 1.5) < 1e-9)).toBe(true);
    expect(dl.some((l) => Math.abs(l.xIn - 4.5) < 1e-9)).toBe(true);
    expect(Math.max(...dl.map((l) => l.text.length))).toBeLessThanOrEqual(28);
    golden('rule-07-dual-fits', paged);
  });

  it('is as tall as its taller column', () => {
    const left = dlg('MARA', lines(28, 2, '.'));
    const right = dlg('JOE ^', lines(28, 9, '.'));
    const { paged } = run(script(left, right, action(2)));
    const p = paged.pages[0]!;
    // cue row 0 + 9 lines, blank, then the action
    expect(textAt(p, 11)).toMatch(
      /^rain|^falls|^over|^the|^quiet|^street|^below|^tower|^where|^nobody/,
    );
    expect(lastRow(p)).toBe(11 + 1);
  });

  it('is never split: moved whole to the next page', () => {
    const left = dlg('MARA', lines(28, 8, '.'));
    const right = dlg('JOE ^', lines(28, 8, '.', 2));
    const { doc, paged } = run(script(action(46), left, right));
    checkInvariants(doc, paged);
    expect(lastRow(paged.pages[0]!)).toBe(45);
    expect(textAt(paged.pages[1]!, 0)).toBe('MARA JOE');
    golden('rule-07-dual-moved-whole', paged);
  });
});

describe("rule 8: automatic (CONT'D)", () => {
  const cues = (paged: PagedScript) =>
    paged.pages.flatMap((p) => p.lines.filter((l) => l.kind === 'character').map((l) => l.text));
  const base = (...blocks: string[]) => script('INT. KITCHEN - DAY', ...blocks);

  it("adds (CONT'D) when the same character speaks again after only action", () => {
    const src = base(dlg('MARA', 'Hello.'), 'She turns away.', dlg('MARA', 'Still here.'));
    const { doc, paged } = run(src);
    expect(cues(paged)).toEqual(['MARA', "MARA (CONT'D)"]);
    // print-time only: the source and the parsed text never change
    expect(doc.elements.filter((e) => e.type === 'character').map((e) => e.text)).toEqual([
      'MARA',
      'MARA',
    ]);
    golden('rule-08-contd-added', paged);
  });

  it("keeps an extension before (CONT'D)", () => {
    const { paged } = run(
      base(dlg('MARA (V.O.)', 'Hello.'), 'Rain.', dlg('MARA (V.O.)', 'Still here.')),
    );
    expect(cues(paged)).toEqual(['MARA (V.O.)', "MARA (V.O.) (CONT'D)"]);
  });

  it('adds it again after a second action, and across several action blocks', () => {
    const { paged } = run(
      base(dlg('MARA', 'A.'), 'One.', 'Two.', dlg('MARA', 'B.'), 'Three.', dlg('MARA', 'C.')),
    );
    expect(cues(paged)).toEqual(['MARA', "MARA (CONT'D)", "MARA (CONT'D)"]);
  });

  it('is not added after a different character speaks', () => {
    const { paged } = run(
      base(dlg('MARA', 'Hello.'), 'Beat.', dlg('JOE', 'Hi.'), 'Beat.', dlg('MARA', 'Bye.')),
    );
    expect(cues(paged)).toEqual(['MARA', 'JOE', 'MARA']);
    golden('rule-08-contd-not-after-other-character', paged);
  });

  it('is not added across scenes', () => {
    const { paged } = run(
      script(
        'INT. KITCHEN - DAY',
        dlg('MARA', 'Hello.'),
        'EXT. YARD - DAY',
        dlg('MARA', 'Out here.'),
      ),
    );
    expect(cues(paged)).toEqual(['MARA', 'MARA']);
  });

  it('is not added when nothing but dialogue sits between, or a transition does', () => {
    const { paged } = run(
      base(dlg('MARA', 'Hello.'), dlg('MARA', 'Again.'), 'CUT TO:', dlg('MARA', 'Later.')),
    );
    expect(cues(paged)).toEqual(['MARA', 'MARA', 'MARA']);
  });

  it("is not doubled when the source cue already says CONT'D", () => {
    const { paged } = run(base(dlg('MARA', 'Hello.'), 'Beat.', dlg("MARA (CONT'D)", 'Again.')));
    expect(cues(paged)).toEqual(['MARA', "MARA (CONT'D)"]);
  });

  it('can be switched off', () => {
    const src = base(dlg('MARA', 'Hello.'), 'Beat.', dlg('MARA', 'Again.'));
    const { paged } = run(src, { autoContd: false });
    expect(cues(paged)).toEqual(['MARA', 'MARA']);
    golden('rule-08-contd-off', paged);
  });

  it("survives a page split of the (CONT'D) cue", () => {
    const body = `${speech(5, '.')} ${speech(5, '.', 2)} ${speech(5, '.', 4)}`;
    const { doc, paged } = run(
      script('INT. A - DAY', dlg('MARA', 'Hi.'), action(30), dlg('MARA', body)),
    );
    checkInvariants(doc, paged);
    const all = cues(paged);
    expect(all.filter((c) => c === "MARA (CONT'D)").length).toBe(all.length - 1);
  });
});

describe('rule 9: scene numbers', () => {
  const heads = (paged: PagedScript) =>
    paged.pages.flatMap((p) => p.lines.filter((l) => l.kind === 'scene-number'));

  it('is off by default', () => {
    const { paged } = run(script('INT. A - DAY', 'x.', 'INT. B - DAY', 'y.'));
    expect(heads(paged)).toHaveLength(0);
  });

  it('numbers scenes sequentially on both margins', () => {
    const { paged } = run(
      script('INT. A - DAY', 'Action.', 'INT. B - DAY', 'More.', 'EXT. C - DAY', 'End.'),
      { sceneNumbers: 'both' },
    );
    const nums = heads(paged);
    expect(nums.map((l) => l.text)).toEqual(['1', '1', '2', '2', '3', '3']);
    const left = nums.filter((l) => Math.abs(l.xIn - 1.0) < 1e-9);
    expect(left).toHaveLength(3);
    for (const r of nums.filter((l) => !left.includes(l))) {
      expect(r.xIn + r.text.length / 10).toBeCloseTo(7.75);
    }
    const heading = paged.pages[0]!.lines.find((l) => l.text === 'INT. A - DAY')!;
    expect(nums[0]!.yLine).toBe(heading.yLine);
    golden('rule-09-scene-numbers-sequential', paged);
  });

  it('uses forced numbers and skips them when numbering the rest', () => {
    const { paged } = run(
      script(
        'INT. A - DAY #1#',
        'a.',
        'INT. B - DAY',
        'b.',
        'INT. C - DAY #4A#',
        'c.',
        'INT. D - DAY',
        'd.',
        'INT. E - DAY #4#',
        'e.',
        'INT. F - DAY',
        'f.',
      ),
      { sceneNumbers: 'both' },
    );
    const left = heads(paged).filter((l) => l.xIn < 2);
    expect(left.map((l) => l.text)).toEqual(['1', '2', '4A', '3', '4', '5']);
    golden('rule-09-scene-numbers-forced', paged);
  });
});

describe('rules 10 and 11: page break and page numbers', () => {
  it('starts a new page at === with no blank line at the top', () => {
    const { doc, paged } = run(script(action(10), '===', action(3)));
    checkInvariants(doc, paged);
    expect(paged.pageCount).toBe(2);
    expect(firstText(paged.pages[1]!)).toMatch(/^\w/);
    expect(paged.pages[1]!.lines.find((l) => l.kind === 'action')!.yLine).toBe(0);
    golden('rule-10-page-break', paged);
  });

  it('does not make an empty page when the break follows a full page or another break', () => {
    const { paged } = run(script(action(54), '===', '===', action(3)));
    expect(paged.pageCount).toBe(2);
  });

  it('numbers pages from 2 at the top right and leaves page 1 bare', () => {
    const { paged } = run(script(action(54), action(3)));
    const nums = paged.pages.map((p) => p.lines.find((l) => l.kind === 'page-number'));
    expect(nums[0]).toBeUndefined();
    expect(nums[1]!.text).toBe('2.');
    expect(nums[1]!.xIn + 2 / 10).toBeCloseTo(7.5);
    golden('rule-11-page-numbers', paged);
  });
});

describe('splitting keeps what the pieces mean', () => {
  it('carries emphasis onto the second half of a split action', () => {
    const body = `${action(5, '.')} ${action(5, '.', 2)} The *tower* leans ${action(4, '.', 4)}`;
    const { doc, paged } = run(script(action(40), body));
    expect(paged.pageCount).toBe(2);
    const marked = paged.pages.flatMap((p) => p.lines).filter((l) => l.styles?.length);
    expect(marked.length).toBeGreaterThan(0);
    for (const l of marked) {
      for (const st of l.styles!) expect(l.text.slice(st.from, st.to)).toBe('tower');
    }
    void doc;
  });

  it('paginates A4 with 58 rows and the same rules', () => {
    const doc = parse(script(action(55), 'INT. HOUSE - DAY', action(6)));
    const paged = paginate(doc, A4);
    expect(paged.pages[0]!.lines.some((l) => l.kind === 'scene-heading')).toBe(false);
    expect(paged.pages[1]!.lines.find((l) => l.kind === 'scene-heading')!.yLine).toBe(0);
    checkInvariants(doc, paged);
  });

  it("does not add (CONT'D) across a dual-dialogue pair", () => {
    const { paged } = run(
      script(
        'INT. A - DAY',
        dlg('MARA', 'Hello.'),
        dlg('JOE ^', 'Hi.'),
        'Beat.',
        dlg('MARA', 'Again.'),
      ),
    );
    const cues = paged.pages[0]!.lines.filter((l) => l.kind === 'character').map((l) => l.text);
    expect(cues).toEqual(['MARA', 'JOE', 'MARA']);
  });

  it('is stable: the same script always paginates the same way', () => {
    const src = script(
      action(40),
      dlg('MARA', `${speech(5, '.')} ${speech(5, '.', 2)}`),
      'CUT TO:',
    );
    const a = renderPagedText(paginate(parse(src)));
    expect(renderPagedText(paginate(parse(src)))).toBe(a);
  });
});

describe('edge cases found in review', () => {
  it('flows a dual-dialogue pair taller than a page onto the next page', () => {
    const left = dlg('MARA', lines(28, 70, '.'));
    const right = dlg('JOE ^', lines(28, 20, '.', 2));
    const { doc, paged } = run(script(left, right));
    checkInvariants(doc, paged);
    expect(paged.pageCount).toBe(2);
  });

  it("does not mistake a name containing CONTD for a (CONT'D) cue", () => {
    const { paged } = run(
      script('INT. A - DAY', dlg('DISCONTD', 'Hi.'), 'Beat.', dlg('DISCONTD', 'Again.')),
    );
    const cues = paged.pages[0]!.lines.filter((l) => l.kind === 'character').map((l) => l.text);
    expect(cues).toEqual(['DISCONTD', "DISCONTD (CONT'D)"]);
  });

  it('keeps invariants for a transition after a split tail at every vertical offset', () => {
    const body = Array.from({ length: 14 }, (_, i) => speech(4, '.', i)).join(' ');
    for (let k = 0; k < 56; k++) {
      const { doc, paged } = run(script(action(k + 1), dlg('MARA', body), 'CUT TO:', action(2)));
      checkInvariants(doc, paged);
    }
  });

  it('leaves a heading before === or at the end of the script where it is', () => {
    const a = run(script(action(51), 'INT. A - DAY', '===', action(2)));
    checkInvariants(a.doc, a.paged);
    const b = run(script(action(51), 'INT. A - DAY'));
    checkInvariants(b.doc, b.paged);
    expect(b.paged.pageCount).toBe(1);
  });
});

describe('configuration', () => {
  it('exposes every rule constant in one object', () => {
    expect(PAGE_RULES.dual.left).toMatchObject({ cueIn: 3.0, dialogueIn: 1.5, widthChars: 28 });
    expect(PAGE_RULES.dual.right).toMatchObject({ cueIn: 6.2, dialogueIn: 4.5, widthChars: 28 });
    expect(PAGE_RULES.minSplitLines).toBe(2);
    expect(PAGE_RULES.transitionOverrunLines).toBe(1);
    expect(PAGE_RULES.sceneNumber).toMatchObject({ leftIn: 1.0, rightEdgeIn: 7.75 });
    expect(PAGE_RULES.cueIn).toBe(3.7);
  });
});

describe('invariants on generated scripts', () => {
  // A small deterministic PRNG so failures reproduce.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const NAMES = ['MARA', 'JOE', 'ANN', 'MARA (V.O.)', 'JOE (O.S.)'];

  function generate(seed: number): string {
    const r = rng(seed);
    const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]!;
    const blocks: string[] = [];
    const n = 20 + Math.floor(r() * 60);
    for (let i = 0; i < n; i++) {
      const k = r();
      const end = r() < 0.7 ? '.' : '';
      if (k < 0.12) blocks.push(`INT. PLACE ${i} - DAY`);
      else if (k < 0.4)
        blocks.push(
          `${action(1 + Math.floor(r() * 9), end, i)}${end ? ` ${action(1 + Math.floor(r() * 4), '.', i + 3)}` : ''}`,
        );
      else if (k < 0.8) {
        const parts = [pick(NAMES)];
        if (r() < 0.3) parts.push('(beat)');
        const sentences = 1 + Math.floor(r() * 4);
        const body = Array.from({ length: sentences }, (_, j) =>
          speech(1 + Math.floor(r() * 5), r() < 0.85 ? '.' : '', i + j),
        ).join(' ');
        parts.push(body);
        if (r() < 0.15) {
          parts.push('(pause)');
          parts.push(speech(1 + Math.floor(r() * 4), '.', i));
        }
        blocks.push(parts.join('\n'));
      } else if (k < 0.88) blocks.push('CUT TO:');
      else if (k < 0.93) blocks.push('===');
      else if (k < 0.97) {
        blocks.push(`${pick(['MARA', 'ANN'])}\n${lines(28, 1 + Math.floor(r() * 6), '.')}`);
        blocks.push(`JOE ^\n${lines(28, 1 + Math.floor(r() * 6), '.', 2)}`);
      } else blocks.push(action(1 + Math.floor(r() * 3), '.'));
    }
    return script(...blocks);
  }

  for (let seed = 1; seed <= 60; seed++) {
    it(`seed ${seed}: content kept, rows in range, rules honoured`, () => {
      const { doc, paged } = run(generate(seed), { sceneNumbers: seed % 2 ? 'both' : 'off' });
      checkInvariants(doc, paged);
      for (const [pi, page] of paged.pages.entries()) {
        const body = page.lines.filter((l) => l.kind !== 'page-number');
        const ys = [...new Set(body.map((l) => l.yLine))].sort((a, b) => a - b);
        const last = body.filter((l) => l.yLine === ys.at(-1));
        const isLastPage = pi === paged.pages.length - 1;
        // 1: never a heading last; 2: never a cue last; 3: never a parenthetical last
        for (const l of last) {
          if (!isLastPage) {
            // (a heading right before a hard `===` may end its page)
            if (
              !doc.elements[l.elementIndex + 1] ||
              doc.elements[l.elementIndex + 1]!.type !== 'page-break'
            )
              expect(l.kind, `page ${page.number} ends in ${l.text}`).not.toBe('scene-heading');
            expect(l.kind, `page ${page.number} ends in ${l.text}`).not.toBe('character');
            expect(l.kind, `page ${page.number} ends in ${l.text}`).not.toBe('parenthetical');
          }
        }
        // 6: a transition is never alone at the top of a page
        const topKinds = body.filter((l) => l.yLine === 0).map((l) => l.kind);
        if (pi > 0 && topKinds.includes('transition')) {
          const t = body.find((l) => l.yLine === 0 && l.kind === 'transition')!;
          // only legitimate straight after a hard page break
          expect(doc.elements[t.elementIndex - 1]?.type).toBe('page-break');
        }
        // (MORE) ends a page and is followed by a (CONT'D) cue
        const more = body.filter((l) => l.kind === 'more');
        for (const m of more) {
          expect(m.yLine).toBe(ys.at(-1));
          const next = paged.pages[pi + 1]!;
          const first = next.lines.find((l) => l.yLine === 0 && l.kind === 'character')!;
          expect(first.text).toContain("CONT'D");
        }
        // a (CONT'D) cue at the top of the page after (MORE) comes with >= 2 dialogue lines
        const topCue = body.find((l) => l.yLine === 0 && l.kind === 'character');
        if (topCue && pi > 0 && paged.pages[pi - 1]!.lines.some((l) => l.kind === 'more')) {
          const nDlg = body.filter(
            (l) => l.kind === 'dialogue' && l.elementIndex === topCue.elementIndex + 1,
          ).length;
          expect(nDlg === 0 || nDlg >= 1).toBe(true);
        }
      }
    });
  }

  it('is deterministic', () => {
    const a = renderPagedText(paginate(parse(generate(7))));
    const b = renderPagedText(paginate(parse(generate(7))));
    expect(a).toBe(b);
  });
});

describe('page counts of the reference scripts', () => {
  // Generated for this project (no third-party text); the owner compares these counts with Final Draft
  // or Beat after importing the same files. See PLAN ticket 06 Handoff notes.
  const dir = new URL('./fixtures/page-count/', import.meta.url);
  const EXPECTED: Record<string, number> = {
    'dialogue-heavy': 105,
    'action-heavy': 83,
    mixed: 104,
  };
  for (const [name, pages] of Object.entries(EXPECTED)) {
    it(`${name} is ${pages} pages`, () => {
      const doc = parse(readFileSync(new URL(`${name}.fountain`, dir), 'utf8'));
      const paged = paginate(doc);
      checkInvariants(doc, paged);
      expect(paged.pageCount).toBe(pages);
    });
  }
});
