---
id: 03
title: Recognise every screenplay element
status: done
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

- [x] Every Fountain element type listed above has at least one parse fixture with a reviewed expected output.
- [x] Title page parsing keeps unknown keys and their order.
- [x] Notes and boneyard, whether inline or spanning lines, are excluded from the paginated text but kept in the document.
- [x] Dual dialogue pairs are marked `left`/`right`.
- [x] `classifyLines` and `parse` agree on every fixture (one test runs both over all fixtures).
- [x] The editor visibly distinguishes every element type in monochrome.
- [x] Parsing a 120-page sample script (build one by repeating fixtures) takes under 30 ms on desktop.
- [x] All earlier tests still pass.

## Out of scope

Page-break rules (06), editing behaviour such as Tab/Enter (08), variables (07).

## Handoff notes

**Compatibility:** `parse(text): ScriptDocument` keeps ticket 01's shape. Type names stay hyphenated (`'scene-heading'`, not `scene_heading`) and line ranges stay `startLine`/`endLine` (0-based, inclusive). New fields only add to it.

**Public API (`src/engine/index.ts`):**
- `parse(text): ScriptDocument = { titlePage: {key,value}[]; elements: ScriptElement[] }`.
- `classifyLines(text): LineClass[]`, one entry per line (split on `\n` or `\r\n`). `LineClass = ElementType | 'title-page' | 'blank'`. Both functions call the same internal `analyze()`.
- `ElementType = 'scene-heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition' | 'centered' | 'lyric' | 'section' | 'synopsis' | 'page-break' | 'note' | 'boneyard'`.
- `ScriptElement` = `{ type, text, raw, from, to, startLine, endLine, forced?, sceneNumber?, dual?, level?, extension?, notes?, styles? }`. `from`/`to` are source offsets of the element's lines (`to` exclusive, excluding the line break).

**Representation details:**
- `text` is display text with markers removed: the leading `. ! @ > ~ # =`, `[[ ]]`, boneyard delimiters, emphasis markers, `\*` escapes, a trailing `^` and a trailing `#12A#` (moved to `sceneNumber`). `raw` is the untouched source.
- `notes?: {from,to,kind:'note'|'boneyard'}[]` holds **absolute source offsets** of every note or boneyard that overlaps the element, and the element's `text` already has them removed (a gap between two spaces loses one space).
- `styles?: {from,to,kind:'bold'|'italic'|'underline'}[]` has offsets into the element's `text` (markers already removed, so `***x***` gives both a bold and an italic span). Emphasis is only parsed in action, dialogue, parenthetical, lyric and centered text. `_` inside words stays literal.
- Notes or boneyard that fill whole lines are `note`/`boneyard` elements (`text` = inner content, trimmed). They are transparent to the surrounding block: a note between two dialogue lines does not end the dialogue, but the dialogue is split into two `dialogue` elements around it.
- Dual dialogue: `dual: 'left'|'right'` is set on every character, parenthetical and dialogue element of both halves of the pair. A `^` cue with no group directly before it is not dual.
- `extension` joins multiple parentheticals with a space (`ANN (O.S.) (CONT'D)` gives `O.S. CONT'D`); `text` keeps the full cue.
- Title page: the block at the very top whose lines are `Key: value` or indented continuations; values with continuation lines are joined with `\n`. If any line in the block is neither, there is no title page. A lone `Key:` with no value or continuation (e.g. `CUT TO:`) is not one either. Title page lines are not elements.
- Scene heading rule from ticket 01 is kept: lines directly after a heading become `action`. A cue needs a non-blank line after it (ignoring whole-line notes) unless forced with `@`. A transition (`...TO:`, or forced with `>`) must be followed by a blank line or end of file.
- Not handled: a blank line (two spaces) inside dialogue, Fountain's "indented lines are action" rule, and inline note/boneyard styling in the editor (only whole-line ones are styled).

**Pagination (`paginate`)** now handles every type: parenthetical x=3.1 wrap 24; transition right-aligned to 7.5"; centered about 4.5"; lyrics use action layout; sections, synopses, notes and boneyard take no space; `page-break` starts a new page (ignored on an empty page). Exports `RIGHT_EDGE_IN` and `CENTER_IN`. Rules for splitting elements across pages are still ticket 06.

**Editor:** `src/ui/elementStyles.ts` is a CodeMirror state field that re-runs `classifyLines` on every change and adds a line class `el-<type>` (`el-title-page` for title lines); CSS is at the end of `src/ui/styles.css`, monochrome. Checked in the dev-server browser pane: headings bold, characters/dialogue/parentheticals indented, parentheticals italic, transitions right-aligned, centred text centred, sections large, synopsis grey italic, boneyard struck through, `===` dashed rule.

**Tests:** `test/parse.test.ts` runs 21 fixtures in `test/fixtures/parse/` against reviewed golden files in `test/golden/parse/` (`UPDATE_GOLDEN=1 npm test` rewrites them; review the diff before committing). It also checks that `classifyLines` agrees with `parse` on every fixture, title-page order, notes/boneyard exclusion from pages, dual dialogue and the new layout. Benchmark: a 6,209-line (about 120-page) script parses in about 4 ms on the dev Mac (the test logs the time and only fails above 300 ms).

**Owner checks:** none. Latency on the Boox itself is still worth a glance once the APK exists (ticket 01/02).
