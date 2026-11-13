---
id: 03
title: Recognise every screenplay element
status: todo
blocked_by: [01]
model: sonnet
---

# 03: Recognise every screenplay element

**Read first:** `SPEC.md` → stories 15, 22–25, 29 and *Implementation Decisions*; the Fountain syntax reference at https://fountain.io/syntax (the authoritative rules); ticket 01 Handoff notes.

## What to build

Replace the minimal parser from ticket 01 with a complete Fountain parser in the Script Engine, and make the editor style each element type as you type. The parser is the foundation for pagination, export, the navigator and the variables, so it needs thorough tests.

## Decisions

- **Write our own parser.** Don't depend on a Fountain parsing library at runtime: we need source positions on every element, plus a line classifier the editor can call. You may *read* `fountain-js` or Afterwriting's parser as a reference.
- Type shape (adjust names freely; keep the information):

  ```ts
  type ElementType =
    | 'scene_heading' | 'action' | 'character' | 'parenthetical' | 'dialogue'
    | 'transition' | 'centered' | 'lyric' | 'section' | 'synopsis'
    | 'page_break' | 'note' | 'boneyard';

  interface ScriptElement {
    type: ElementType;
    text: string;            // display text, with Fountain markers removed (e.g. leading '.', '@', '>', '~')
    raw: string;             // original source
    from: number; to: number; // source character offsets
    lineFrom: number; lineTo: number;
    forced?: boolean;
    sceneNumber?: string;    // from a trailing #12A#
    dual?: 'left' | 'right'; // character with a trailing ^ makes the pair
    level?: number;          // section depth (# = 1)
    extension?: string;      // V.O., O.S., CONT'D, etc. on character cues
  }

  interface ScriptDocument {
    titlePage: { key: string; value: string }[]; // keeps original order and unknown keys
    elements: ScriptElement[];
  }
  ```

- **Notes** (`[[ ]]`) and **boneyard** (`/* */`) can appear inline or span several lines. Inline ones are kept as spans on their element (e.g. `notes: {from,to}[]`) so the printed text can drop them. Notes or boneyard that fill whole lines become elements of their own.
- **Title page:** the block of `Key: value` lines at the very top of the file, ending at the first blank line. Values can continue on indented lines. Keep every key, including unknown ones; ticket 07 stores variables there.
- **Emphasis** (`*italic*`, `**bold**`, `_underline_`) is kept as style spans on the element (`styles: {from,to,kind}[]`) for the PDF to use later.
- Export a **line classifier** `classifyLines(text): ElementType[]` (one entry per source line) for the editor, sharing the same logic as `parse`.
- Editor styling uses CodeMirror line decorations with a CSS class per element type. Styling must be monochrome. Suggested styles:
  - scene headings: bold
  - character: indented, uppercase
  - dialogue: indented
  - parenthetical: italic and indented
  - notes: dotted underline, grey
  - boneyard: struck through, grey
  - sections: larger and bold
  - synopses: italic, grey

  The editor shows indents approximately; the print view is the exact layout.
- Update `paginate` from ticket 01 so it handles every element type at a basic level: parenthetical indent 3.1" with width 2.4"; transitions right-aligned to 7.5"; centered text centred; sections, synopses, notes and boneyard not printed; `===` forces a new page. Proper page-break rules come in ticket 06.

## Steps

1. Write fixtures first in `test/fixtures/parse/`. One small `.fountain` file per syntax rule, using the examples in the Fountain syntax reference **in your own words**: forced scene heading `.`, forced action `!`, forced character `@`, transitions ending `TO:` and forced `>`, centred `>text<`, lyrics `~`, `===` page break, sections, synopses, notes, boneyard, dual dialogue `^`, scene numbers `#1A#`, character extensions, a title page with multi-line values, and edge cases (a character cue at the end of the file, an all-caps action line not followed by dialogue, tabs and trailing spaces). *(Writing the fixture files is Haiku-suitable.)*
2. Write the expected output for each as a readable list in `test/golden/parse/` (e.g. `TYPE | text` per element). Let the test runner create and update these with `UPDATE_GOLDEN=1`, and review every one by hand before committing.
3. Implement the parser until every golden test passes.
4. Hook the classifier into CodeMirror decorations. Re-classify on change; a full re-parse of 6,000 lines must take under 30 ms on desktop. Add a benchmark test that logs the time; it doesn't need to fail.

## Acceptance criteria

- [ ] Every Fountain element type listed above has at least one parse fixture with a reviewed expected output.
- [ ] Title page parsing keeps unknown keys and their order.
- [ ] Notes and boneyard, whether inline or spanning lines, are excluded from the paginated text but kept in the document.
- [ ] Dual dialogue pairs are marked `left`/`right`.
- [ ] `classifyLines` and `parse` agree on every fixture (one test runs both over all fixtures).
- [ ] The editor visibly distinguishes every element type in monochrome.
- [ ] Parsing a 120-page sample script (build one by repeating fixtures) takes under 30 ms on desktop.
- [ ] All earlier tests still pass.

## Out of scope

Page-break rules (06), editing behaviour such as Tab/Enter (08), variables (07).

## Handoff notes

_(Fill in: final type names, how inline spans are represented.)_
