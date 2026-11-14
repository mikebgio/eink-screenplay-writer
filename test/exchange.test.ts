import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { exportFdx, importFdx, parse, resolve, toFountain } from '../src/engine';
import type { ElementType, ScriptDocument } from '../src/engine';

const PARSE_FIXTURES = new URL('./fixtures/parse/', import.meta.url);
const FDX_FIXTURES = new URL('./fixtures/fdx/', import.meta.url);
const GOLDEN = new URL('./golden/exchange/', import.meta.url);

const fixtureNames = readdirSync(PARSE_FIXTURES)
  .filter((f) => f.endsWith('.fountain'))
  .map((f) => f.replace(/\.fountain$/, ''))
  .sort();
const read = (url: URL, name: string) => readFileSync(new URL(name, url), 'utf8');

/** What "the same script" means: element types and text (plus the structure the formats can carry). */
function shape(doc: ScriptDocument, only?: ReadonlySet<ElementType>) {
  return {
    title: doc.titlePage.map((t) => [t.key, t.value]),
    elements: doc.elements
      .filter((e) => !only || only.has(e.type))
      .map((e) => ({
        type: e.type,
        text: e.text,
        dual: e.dual,
        level: e.level,
        sceneNumber: e.sceneNumber,
        identity: e.identity,
        styles: e.styles?.map((s) => `${s.kind}:${s.from}-${s.to}`).sort(),
      })),
  };
}

/** FDX has no place for sections, synopses, notes or boneyard. */
const FDX_TYPES = new Set<ElementType>([
  'scene-heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'centered',
  'lyric',
  'page-break',
]);

describe('toFountain', () => {
  for (const name of fixtureNames) {
    it(`round-trips ${name}`, () => {
      const text = read(PARSE_FIXTURES, `${name}.fountain`);
      const doc = parse(text);
      const out = toFountain(doc, { dropVariables: false });
      expect(shape(parse(out))).toEqual(shape(doc));
      // Writing is stable: a second pass changes nothing.
      expect(toFountain(parse(out), { dropVariables: false })).toBe(out);
    });
  }

  it('round-trips the sample script', () => {
    const doc = parse(read(new URL('./fixtures/', import.meta.url), 'sample.fountain'));
    expect(shape(parse(toFountain(doc, { dropVariables: false })))).toEqual(shape(doc));
  });

  it('uses forcing characters only where the classifier would misread a line', () => {
    const doc = parse(
      [
        'INT. HOUSE - DAY',
        '',
        'A plain line of action.',
        '',
        '!BANG',
        'BOOM',
        '',
        '@McCLANE',
        'Yippee.',
        '',
        '.OPENING TITLES',
        '',
        '>FADE OUT.',
      ].join('\n'),
    );
    const out = toFountain(doc, { dropVariables: false });
    expect(out).toContain('\n\nA plain line of action.\n');
    expect(out).toContain('\n!BANG\nBOOM\n');
    expect(out).toContain('\n@McCLANE\nYippee.');
    expect(out).toContain('\n.OPENING TITLES\n');
    expect(out).toContain('\n>FADE OUT.\n');
    expect(shape(parse(out))).toEqual(shape(doc));
  });

  it('does not let an action line become a title page', () => {
    const doc = parse('!Note: this is action.\n\nINT. HOUSE - DAY');
    expect(doc.titlePage).toEqual([]);
    const out = toFountain(doc, { dropVariables: false });
    expect(parse(out).titlePage).toEqual([]);
    expect(shape(parse(out))).toEqual(shape(doc));
  });

  it('keeps notes inside a dialogue block', () => {
    const doc = parse('BOB\nOne.\n[[a note]]\nTwo.\n\nAfter.');
    expect(shape(parse(toFountain(doc, { dropVariables: false })))).toEqual(shape(doc));
  });

  describe('with variables filled in', () => {
    const script = [
      'Title: Test',
      'Var-HERO: Jack Reyes',
      'Var-TOWN: Springfield',
      '',
      'INT. {{TOWN}} DINER - DAY',
      '',
      '{{HERO}}',
      'I love {{TOWN}}. Literal: \\{{ESCAPED}}',
      '',
      '{{MISSING}} is not defined.',
    ].join('\n');

    it('has no Var- lines and no unescaped {{', () => {
      const out = toFountain(parse(script), { dropVariables: true });
      expect(out).not.toContain('Var-');
      expect(out).not.toMatch(/(?<!\\)\{\{/);
      expect(out).toContain('Title: Test');
      expect(out).toContain('INT. Springfield DINER - DAY');
      expect(out).toContain('JACK REYES');
      expect(out).toContain('I love Springfield.');
    });

    it('gives the same result for a document that was already resolved', () => {
      const doc = parse(script);
      expect(toFountain(resolve(doc).doc, { dropVariables: true })).toBe(
        toFountain(doc, { dropVariables: true }),
      );
    });

    it('keeps the Var- lines and {{KEY}} when asked to', () => {
      const out = toFountain(parse(script), { dropVariables: false });
      expect(out).toContain('Var-HERO: Jack Reyes');
      expect(out).toContain('{{TOWN}}');
    });

    it('writes escaped literals so other editors show them as text', () => {
      const out = toFountain(parse(script), { dropVariables: true });
      expect(out).toContain('\\{{ESCAPED}}');
      expect(out).toContain('\\{{MISSING}}');
    });
  });
});

describe('exportFdx', () => {
  const doc = (text: string) => resolve(parse(text)).doc;

  it('is well-formed XML that uses only the listed paragraph types', () => {
    const text = [
      'Title: Rainy Night',
      'Credit: Written by',
      'Author: Pat Writer',
      '',
      'INT. KITCHEN - NIGHT',
      '',
      'Rain hammers the *window* & the "roof" <loudly> isn\'t it.',
      '',
      '>THE END<',
      '',
      '~La la la',
      '',
      'MAYA',
      '(quietly)',
      "We're not alone.",
      '',
      'CUT TO:',
      '',
      '===',
      '',
      '# Act One',
      '',
      '= synopsis',
      '',
      '[[note]]',
      '',
      '/* gone */',
      '',
      'EXT. STREET - DAY',
    ].join('\n');
    const xml = exportFdx(doc(text));
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>')).toBe(true);
    const types = new Set([...xml.matchAll(/<Paragraph[^>]*\sType="([^"]*)"/g)].map((m) => m[1]));
    for (const t of types) {
      expect([
        'Scene Heading',
        'Action',
        'Character',
        'Parenthetical',
        'Dialogue',
        'Transition',
      ]).toContain(t);
    }
    expect(types.size).toBe(6);
  });

  it('maps elements to Final Draft paragraphs', () => {
    const xml = exportFdx(
      doc('INT. A - DAY\n\nAction.\n\n>CENTER<\n\n~Sing\n\nBOB\n(soft)\nHi.\n\nCUT TO:'),
    );
    expect(xml).toContain('<Paragraph Type="Scene Heading"><Text>INT. A - DAY</Text></Paragraph>');
    expect(xml).toContain('<Paragraph Type="Action"><Text>Action.</Text></Paragraph>');
    expect(xml).toContain(
      '<Paragraph Type="Action" Alignment="Center"><Text>CENTER</Text></Paragraph>',
    );
    expect(xml).toContain(
      '<Paragraph Type="Dialogue"><Text Style="Italic">Sing</Text></Paragraph>',
    );
    expect(xml).toContain('<Paragraph Type="Character"><Text>BOB</Text></Paragraph>');
    expect(xml).toContain('<Paragraph Type="Parenthetical"><Text>(soft)</Text></Paragraph>');
    expect(xml).toContain('<Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>');
  });

  it('omits sections, synopses, notes and boneyard', () => {
    const xml = exportFdx(doc('# Section\n\n= syn\n\n[[note]]\n\n/* bone */\n\nAction.'));
    for (const hidden of ['Section', 'syn', 'note', 'bone']) expect(xml).not.toContain(hidden);
    expect(xml).toContain('Action.');
  });

  it('puts a page break on the next paragraph', () => {
    const xml = exportFdx(doc('One.\n\n===\n\nTwo.'));
    expect(xml).toContain(
      '<Paragraph Type="Action" StartsNewPage="Yes"><Text>Two.</Text></Paragraph>',
    );
    expect(xml).not.toMatch(
      /One\.<\/Text><\/Paragraph>\s*<Paragraph[^>]*StartsNewPage="Yes"[^>]*>\s*<Text>One/,
    );
  });

  it('wraps both halves of dual dialogue in one DualDialogue paragraph', () => {
    const xml = exportFdx(doc('BRICK\nScrew retirement.\n\nSTEEL ^\nScrew everything.'));
    expect(xml).toMatch(
      /<Paragraph><DualDialogue>[\s\S]*BRICK[\s\S]*STEEL[\s\S]*<\/DualDialogue><\/Paragraph>/,
    );
    expect(xml.match(/<DualDialogue>/g)).toHaveLength(1);
  });

  it('splits text runs at style boundaries', () => {
    const xml = exportFdx(doc('A *b* **c** ***d*** _e_ **_f_**.'));
    expect(xml).toContain(
      '<Text>A </Text><Text Style="Italic">b</Text><Text> </Text><Text Style="Bold">c</Text>' +
        '<Text> </Text><Text Style="Bold+Italic">d</Text><Text> </Text><Text Style="Underline">e</Text>' +
        '<Text> </Text><Text Style="Bold+Underline">f</Text><Text>.</Text>',
    );
  });

  it('writes scene numbers only when asked', () => {
    const script = 'INT. A - DAY\n\nx\n\nINT. B - DAY #5A#\n\ny\n\nINT. C - DAY';
    expect(exportFdx(doc(script))).not.toContain('Number=');
    const xml = exportFdx(doc(script), { sceneNumbers: true });
    expect(xml).toContain('<Paragraph Type="Scene Heading" Number="1">');
    expect(xml).toContain('<Paragraph Type="Scene Heading" Number="5A">');
    expect(xml).toContain('<Paragraph Type="Scene Heading" Number="2">');
  });

  it('writes a centred title page', () => {
    const xml = exportFdx(
      doc('Title: Rainy Night\nAuthor: Pat\nDraft date: 1/2/2026\nContact: a@b.c\n\nx'),
    );
    const page = /<TitlePage>([\s\S]*)<\/TitlePage>/.exec(xml)![1]!;
    expect(page).toContain('<Paragraph Alignment="Center"><Text>Rainy Night</Text></Paragraph>');
    expect(page).toContain('<Paragraph Alignment="Center"><Text>Pat</Text></Paragraph>');
    expect(page).toContain('<Paragraph Alignment="Right"><Text>1/2/2026</Text></Paragraph>');
    expect(page).toContain('<Paragraph Alignment="Left"><Text>a@b.c</Text></Paragraph>');
  });

  it('has no title page for a script without one', () => {
    expect(exportFdx(doc('INT. A - DAY'))).not.toContain('<TitlePage>');
  });
});

describe('FDX round trip', () => {
  const fdxFixtures = [
    'dual-dialogue',
    'emphasis',
    'title-page',
    'character-extensions',
    'page-break',
    'lyrics',
    'centered',
    'transitions',
    'dialogue-parentheticals',
    'action-forced',
    'character-forced',
    'scene-heading-forced',
  ];
  for (const name of fdxFixtures) {
    it(name, () => {
      const original = parse(read(PARSE_FIXTURES, `${name}.fountain`));
      const xml = exportFdx(resolve(original).doc);
      const back = parse(importFdx(xml));
      const expected = shape(original, FDX_TYPES);
      const actual = shape(back, FDX_TYPES);
      // Scene numbers are only written when the export option is on (tested below).
      for (const e of [...expected.elements, ...actual.elements]) delete e.sceneNumber;
      // FDX keeps the standard title-page fields only.
      const standard = ['Title', 'Credit', 'Author', 'Source', 'Draft date', 'Contact'];
      expected.title = expected.title.filter(([k]) => standard.includes(k!));
      actual.title = actual.title.filter(([k]) => standard.includes(k!));
      // A page break at the very end has no paragraph to carry it.
      expect(actual.elements).toEqual(
        expected.elements.filter((e, i, all) => !(e.type === 'page-break' && i === all.length - 1)),
      );
      expect(actual.title).toEqual(expected.title);
    });
  }

  it('keeps scene numbers when the export option is on', () => {
    const original = parse(read(PARSE_FIXTURES, 'scene-numbers.fountain'));
    const back = parse(importFdx(exportFdx(resolve(original).doc, { sceneNumbers: true })));
    const headings = (d: ScriptDocument) => d.elements.filter((e) => e.type === 'scene-heading');
    expect(headings(back).map((e) => e.text)).toEqual(headings(original).map((e) => e.text));
    expect(headings(back).every((e) => e.sceneNumber !== undefined)).toBe(true);
    for (const [i, h] of headings(original).entries()) {
      if (h.sceneNumber !== undefined) expect(headings(back)[i]!.sceneNumber).toBe(h.sceneNumber);
    }
  });

  it('keeps special characters', () => {
    const original = parse('Tom & Jerry say "hi" <now> and don\'t go.');
    const back = parse(importFdx(exportFdx(original)));
    expect(back.elements[0]!.text).toBe('Tom & Jerry say "hi" <now> and don\'t go.');
  });

  it('keeps multi-line action together', () => {
    const original = parse('First line\nSecond line\nThird.');
    const back = parse(importFdx(exportFdx(original)));
    expect(back.elements).toHaveLength(1);
    expect(back.elements[0]!.text).toBe('First line\nSecond line\nThird.');
  });

  it('keeps variable-filled values', () => {
    const original = resolve(parse('Var-HERO: Jack\n\n{{HERO}}\nHi.\n\n{{HERO}} walks in.')).doc;
    const back = parse(importFdx(exportFdx(original)));
    expect(back.elements.map((e) => e.text)).toEqual(['JACK', 'Hi.', 'Jack walks in.']);
  });
});

describe('importFdx', () => {
  const wrap = (body: string, title = '') =>
    `<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content>${body}</Content>${title}</FinalDraft>`;
  const p = (type: string, text: string, attrs = '') =>
    `<Paragraph Type="${type}"${attrs}><Text>${text}</Text></Paragraph>`;
  const types = (xml: string) => parse(importFdx(xml)).elements.map((e) => `${e.type}:${e.text}`);

  it('reads scripts from Final Draft and Fade In', () => {
    for (const file of ['final-draft.fdx', 'fade-in.fdx']) {
      const text = importFdx(read(FDX_FIXTURES, file));
      const doc = parse(text);
      expect(doc.elements.map((e) => e.type)).toEqual([
        'scene-heading',
        'action',
        'character',
        'parenthetical',
        'dialogue',
        'action',
        'character',
        'dialogue',
        'character',
        'dialogue',
        'transition',
        'scene-heading',
        'action',
        'character',
        'dialogue',
        'transition',
      ]);
      expect(doc.elements.filter((e) => e.type === 'character').map((e) => e.text)).toContain(
        'JIM (O.S.)',
      );
      expect(doc.titlePage.map((t) => t.key)).toEqual([
        'Title',
        'Credit',
        'Author',
        'Copyright',
        'Draft date',
        'Contact',
      ]);
    }
  });

  describe('golden files from real FDX exports', () => {
    for (const [fixture, golden] of [
      ['final-draft.fdx', 'final-draft.fountain'],
      ['fade-in.fdx', 'fade-in.fountain'],
    ] as const) {
      it(fixture, () => {
        const actual = importFdx(read(FDX_FIXTURES, fixture));
        const file = new URL(golden, GOLDEN);
        if (process.env.UPDATE_GOLDEN) {
          mkdirSync(GOLDEN, { recursive: true });
          writeFileSync(file, actual);
        }
        expect(existsSync(file), `missing golden ${golden} (run with UPDATE_GOLDEN=1)`).toBe(true);
        expect(actual).toBe(readFileSync(file, 'utf8'));
      });
    }
  });

  it('maps unknown paragraph types to action', () => {
    expect(
      types(
        wrap(
          p('General', 'Some text.') +
            p('Cast List', 'Cast') +
            p('New Act', 'ACT ONE') +
            p('Whatever', 'Hmm.'),
        ),
      ),
    ).toEqual(['action:Some text.', 'action:Cast', 'action:ACT ONE', 'action:Hmm.']);
  });

  it('turns a capitalised Shot into a forced scene heading, otherwise action', () => {
    expect(types(wrap(p('Shot', 'CLOSE ON THE KNIFE') + p('Shot', 'Close on the knife')))).toEqual([
      'scene-heading:CLOSE ON THE KNIFE',
      'action:Close on the knife',
    ]);
  });

  it('forces lines the classifier would misread', () => {
    expect(
      types(
        wrap(
          p('Action', 'BANG') +
            p('Character', 'McCLANE') +
            p('Dialogue', 'Yippee.') +
            p('Scene Heading', 'OPENING TITLES') +
            p('Transition', 'FADE OUT.') +
            p('Action', '= not a synopsis') +
            p('Action', '# not a section'),
        ),
      ),
    ).toEqual([
      'action:BANG',
      'character:McCLANE',
      'dialogue:Yippee.',
      'scene-heading:OPENING TITLES',
      'transition:FADE OUT.',
      'action:= not a synopsis',
      'action:# not a section',
    ]);
  });

  it('reads scene numbers, page breaks and centred text', () => {
    const xml = wrap(
      p('Scene Heading', 'INT. A - DAY', ' Number="12A"') +
        p('Action', 'Centred', ' Alignment="Center"') +
        p('Action', 'Next page', ' StartsNewPage="Yes"'),
    );
    const doc = parse(importFdx(xml));
    expect(doc.elements.map((e) => e.type)).toEqual([
      'scene-heading',
      'centered',
      'page-break',
      'action',
    ]);
    expect(doc.elements[0]).toMatchObject({ sceneNumber: '12A' });
  });

  it('reads dual dialogue', () => {
    const xml = wrap(
      '<Paragraph><DualDialogue>' +
        p('Character', 'BRICK') +
        p('Dialogue', 'Left.') +
        p('Character', 'STEEL') +
        p('Parenthetical', '(beat)') +
        p('Dialogue', 'Right.') +
        '</DualDialogue></Paragraph>',
    );
    const doc = parse(importFdx(xml));
    expect(doc.elements.map((e) => `${e.type}:${e.dual}`)).toEqual([
      'character:left',
      'dialogue:left',
      'character:right',
      'parenthetical:right',
      'dialogue:right',
    ]);
  });

  it('reads styled runs', () => {
    const xml = wrap(
      '<Paragraph Type="Action"><Text>A </Text><Text Style="Bold+Italic">loud</Text><Text Style="Underline"> one</Text><Text Style="AllCaps"> x</Text></Paragraph>',
    );
    const el = parse(importFdx(xml)).elements[0]!;
    expect(el.text).toBe('A loud one x');
    expect(el.styles?.map((s) => `${s.kind}:${el.text.slice(s.from, s.to)}`).sort()).toEqual([
      'bold:loud',
      'italic:loud',
      'underline:one',
    ]);
  });

  it('ignores everything outside the script and title page', () => {
    const xml = wrap(
      p('Action', 'Real.'),
      '<Watermarking><Paragraph Type="Action"><Text>watermark</Text></Paragraph></Watermarking>' +
        '<ElementSettings Type="Action"><Paragraph Type="Action"><Text>settings</Text></Paragraph></ElementSettings>',
    );
    expect(types(xml)).toEqual(['action:Real.']);
  });

  it('skips empty paragraphs and decodes entities', () => {
    expect(
      types(
        wrap(
          '<Paragraph Type="Action"><Text/></Paragraph>' +
            p('Action', 'Tom &amp; Jerry &lt;3 &#39;x&#39;'),
        ),
      ),
    ).toEqual(["action:Tom & Jerry <3 'x'"]);
  });

  it('guesses title-page fields from centred text', () => {
    const para = (text: string, align = 'Center') =>
      text === ''
        ? `<Paragraph Alignment="${align}"/>`
        : `<Paragraph Alignment="${align}"><Text>${text}</Text></Paragraph>`;
    const title =
      '<TitlePage><Content>' +
      para('') +
      para('MY MOVIE') +
      para('') +
      para('Written by') +
      para('') +
      para('Pat Writer') +
      para('') +
      para('Based on a novel') +
      para('1/2/2026', 'Right') +
      para('Agent Smith', 'Left') +
      para('555-0100', 'Left') +
      '</Content></TitlePage>';
    const doc = parse(importFdx(wrap(p('Action', 'x'), title)));
    expect(Object.fromEntries(doc.titlePage.map((t) => [t.key, t.value]))).toEqual({
      Title: 'MY MOVIE',
      Credit: 'Written by',
      Author: 'Pat Writer',
      Source: 'Based on a novel',
      'Draft date': '1/2/2026',
      Contact: 'Agent Smith\n555-0100',
    });
  });

  it('rejects files that are not Final Draft documents', () => {
    expect(() => importFdx('<html><body/></html>')).toThrow(/Final Draft/);
    expect(() => importFdx('not xml at all')).toThrow(/Final Draft/);
    expect(() => importFdx('')).toThrow(/Final Draft/);
  });
});

describe('parser sanity', () => {
  it('fast-xml-parser is available without a DOM', () => {
    expect(typeof XMLParser).toBe('function');
    expect(typeof document).toBe('undefined');
  });
});

describe('importFdx input handling', () => {
  it('ignores a byte-order mark and leading whitespace', () => {
    const xml =
      '<FinalDraft><Content><Paragraph Type="Action"><Text>Hi.</Text></Paragraph></Content></FinalDraft>';
    expect(importFdx(`\uFEFF\n  ${xml}`)).toBe(importFdx(xml));
  });
});

describe('review follow-ups', () => {
  const wrap = (body: string) =>
    `<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content>${body}</Content></FinalDraft>`;
  const p = (type: string, text: string, attrs = '') =>
    `<Paragraph Type="${type}"${attrs}><Text>${text}</Text></Paragraph>`;
  const types = (xml: string) => parse(importFdx(xml)).elements.map((e) => `${e.type}:${e.text}`);

  it('uses no regex lookbehind (older WebViews reject it when the bundle loads)', () => {
    for (const file of [
      '../src/engine/fountainOut.ts',
      '../src/engine/fdx.ts',
      '../src/storage/exchange.ts',
    ]) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8'), file).not.toMatch(/\(\?<[!=]/);
    }
  });

  it('escapes {{ only where it is not already escaped', () => {
    const out = toFountain(parse('A \\{{ONE}} and {{TWO}}.'), { dropVariables: true });
    expect(out).toContain('A \\{{ONE}} and \\{{TWO}}.');
  });

  it('reads Dialogue with no cue as action, or as a lyric when it is wholly italic', () => {
    const xml = wrap(
      p('Action', 'Setup.') +
        p('Dialogue', 'Nobody is speaking.') +
        '<Paragraph Type="Dialogue"><Text Style="Italic">La la la</Text></Paragraph>',
    );
    expect(types(xml)).toEqual(['action:Setup.', 'action:Nobody is speaking.', 'lyric:La la la']);
  });

  it('does not turn dialogue after an empty cue into a lyric', () => {
    const xml = wrap(
      p('Character', 'BOB') +
        p('Dialogue', 'Hi.') +
        '<Paragraph Type="Character"/>' +
        p('Dialogue', 'Hello?'),
    );
    expect(types(xml)).toEqual(['character:BOB', 'dialogue:Hi.', 'action:Hello?']);
  });

  it('keeps a group open across empty paragraphs', () => {
    const xml = wrap(p('Character', 'BOB') + '<Paragraph Type="Action"/>' + p('Dialogue', 'Hi.'));
    expect(types(xml)).toEqual(['character:BOB', 'dialogue:Hi.']);
  });

  it('keeps dialogue text that starts like another element, and a lone (aside) as a parenthetical', () => {
    const xml = wrap(
      p('Character', 'BOB') +
        p('Dialogue', '~sings') +
        p('Dialogue', '= equals') +
        p('Dialogue', '(laughs)'),
    );
    expect(types(xml)).toEqual([
      'character:BOB',
      'dialogue:~sings\n= equals',
      'parenthetical:(laughs)',
    ]);
  });

  describe('page breaks and dual dialogue', () => {
    const text = 'One.\n\n===\n\nBRICK\nLeft.\n\nSTEEL ^\nRight.\n\nAfter.';
    const doc = resolve(parse(text)).doc;

    it('puts StartsNewPage on the DualDialogue wrapper, not the nested paragraph', () => {
      const xml = exportFdx(doc);
      expect(xml).toContain('<Paragraph StartsNewPage="Yes"><DualDialogue>');
      const inner = xml.slice(xml.indexOf('<DualDialogue>'), xml.indexOf('</DualDialogue>'));
      expect(inner).not.toContain('StartsNewPage');
    });

    it('survives a round trip', () => {
      const back = parse(importFdx(exportFdx(doc)));
      expect(back.elements.map((e) => e.type)).toEqual(doc.elements.map((e) => e.type));
    });

    it('does not write a page break that has nothing after it', () => {
      const xml = exportFdx(resolve(parse('One.\n\n===')).doc);
      expect(xml).not.toContain('StartsNewPage');
    });
  });

  it('writes Copyright and Notes on the title page and reads them back', () => {
    const source = [
      'Title: Rainy Night',
      'Credit: Written by',
      'Author: Pat Writer',
      'Source: Based on a novel',
      'Notes: First draft',
      'Copyright: © 2026 Pat Writer',
      'Draft date: 1/2/2026',
      'Contact: pat@example.com',
      '',
      'Action.',
    ].join('\n');
    const xml = exportFdx(resolve(parse(source)).doc);
    expect(xml).toContain('First draft');
    expect(xml).toContain('© 2026 Pat Writer');
    const back = parse(importFdx(xml));
    expect(Object.fromEntries(back.titlePage.map((t) => [t.key, t.value]))).toEqual({
      Title: 'Rainy Night',
      Credit: 'Written by',
      Author: 'Pat Writer',
      Source: 'Based on a novel',
      Notes: 'First draft',
      Copyright: '© 2026 Pat Writer',
      'Draft date': '1/2/2026',
      Contact: 'pat@example.com',
    });
  });
});
