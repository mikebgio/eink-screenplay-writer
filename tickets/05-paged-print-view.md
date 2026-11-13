---
id: 05
title: Paged print view with basic page breaks
status: done
blocked_by: [03]
model: sonnet
---

# 05: Paged print view with basic page breaks

**Read first:** `SPEC.md` → stories 41, 43, 45–47 and _Pagination spec_; ticket 03 Handoff notes.

## What to build

Make the print view a proper paginated script. It uses the correct measurements, shows a page count and estimated running time, and is navigated by **turning pages instead of scrolling**. Page layout is checked with saved, readable expected results (golden tests) that later tickets extend.

## Decisions

- **Page spec** (one object, passed to `paginate`; US Letter is the default):

  |                     | US Letter   | A4              |
  | ------------------- | ----------- | --------------- |
  | Page                | 8.5 × 11 in | 8.27 × 11.69 in |
  | Top / bottom margin | 1 in / 1 in | 1 in / 1 in     |
  | Body lines per page | 54          | 58              |

  Horizontal positions are the same for both (measured from the left edge of the page; Courier 12pt = 10 characters per inch, 6 lines per inch):

  | Element               | Left                                                  | Width (chars) |
  | --------------------- | ----------------------------------------------------- | ------------- |
  | Scene heading, action | 1.5 in                                                | 60            |
  | Character cue         | 3.7 in                                                | 38            |
  | Parenthetical         | 3.1 in                                                | 24            |
  | Dialogue              | 2.5 in                                                | 35            |
  | Transition            | right edge at 7.5 in                                  | —             |
  | Centered              | centred between 1.5 and 7.5 in                        | 60            |
  | Page number           | right edge at 7.5 in, 0.5 in from top; none on page 1 | —             |

- **Spacing:** one blank line before every scene heading, action block, character cue, transition and centered block. None between character → parenthetical → dialogue. Skip blank lines at the very top of a page.
- **Wrapping:** break at word boundaries. A word longer than the width is hard-broken.
- **Output:** `PagedScript = { pages: Page[]; pageCount; estimatedMinutes }`, where `Page = { number; lines: PositionedLine[] }` and `PositionedLine = { text; xIn; yLine; kind; elementIndex; styles? }`. `elementIndex` links back to the source element, for jumping from the print view to the editor (and back).
- **Golden format:** render each page as plain text, 85 columns wide (8.5 in × 10 characters per inch), with a header line `=== PAGE n ===`, placing each line at its x position in characters. Store these in `test/golden/paginate/*.txt` and update them with `UPDATE_GOLDEN=1`. This readable format is what reviewers check, so make it clear.
- **Basic page breaks (this ticket only):** when an element doesn't fit, move it **whole** to the next page. If one element is taller than a full page, split it at a line boundary. The industry rules come in ticket 06, which replaces this behaviour.
- **Running time** = page count × 1 minute (show as "≈ 1h 52m"). The title page doesn't count.
- **Title page:** rendered as page 0 when present (title centred about a third of the way down; credit, author and source below it; draft date and contact at the bottom left). It isn't counted in the numbering.
- **Navigation:**
  - The print view shows exactly one page.
  - Tap the right third of the page or press PgDn / Space to go forward; tap the left third or press PgUp / Shift+Space to go back.
  - Show "Page n of N" text.
  - Never scroll or animate.
  - The editor follows the print view: when the cursor moves to a different page, the print view jumps to that page. Tapping a line in the print view puts the editor cursor on its source line.
- **Layout modes:** _Editor only_, _Print view only_, or _Side by side_ (the default when wider than 1000 px). Toggle with `Ctrl+P`. Remember the choice in Preferences.
- Pagination runs on every parse (debounced). If paginating 120 pages takes more than 50 ms on desktop, move it to a Web Worker.

## Acceptance criteria

- [x] At least 8 golden pagination fixtures: short scene; long action that wraps; dialogue with a parenthetical; transitions; centered text; a forced page break; the title page; a script just over one page long. Each golden file has been reviewed by eye.
- [x] A4 and US Letter give different page counts for the same 3-page fixture (tested).
- [x] Page count and running time are shown and correct for fixtures (tested through the engine; displayed in the UI).
- [x] Page navigation works with taps and keys; no scrollbars appear in the print view.
- [x] Moving the editor cursor across a page boundary changes the displayed page; tapping a printed line moves the editor cursor (manual check in the browser).
- [x] Layout mode toggles and is remembered.
- [x] Pagination of 120 pages takes under 50 ms (benchmark logged), or runs in a worker.

## Out of scope

(MORE)/(CONT'D), orphan control, sentence splitting, dual dialogue layout, scene numbers (all ticket 06). Volume keys (ticket 15).

## Handoff notes

**Engine API (`src/engine/index.ts`):**

- `paginate(doc: ScriptDocument, spec: PageSpec = US_LETTER): PagedScript`. Also `US_LETTER`, `A4`, `formatRunningTime(min)` ("≈ 1h 52m"), `wrap`.
- `PageSpec = { name: 'letter'|'a4'; widthIn; heightIn; topMarginIn; bodyLines }` (Letter 54 lines, A4 58).
- `PagedScript = { pages: Page[]; pageCount; estimatedMinutes; titlePage?: Page; spec: PageSpec }`. `pages[i].number === i+1` and is never empty. `titlePage` has `number: 0`, is not counted in `pageCount`/`estimatedMinutes` and exists only when the title block has Title/Credit/Author(s)/Source/Draft date/Contact (other keys, e.g. `Var-*`, are ignored).
- `Page = { number; lines: PositionedLine[] }`; `PositionedLine = { text; xIn; yLine; kind; elementIndex; styles? }`. `yLine` is the row from the top of the body area (6 per inch; y in inches = `topMarginIn + yLine/6`); the page number is on row -3 with `kind: 'page-number'`, `elementIndex: -1`, text `"2."` (none on page 1). `kind` is an `ElementType`, `'page-number'`, or a title-page kind. `styles` is line-relative emphasis. **Breaking vs ticket 03:** `x`/`y`/`type`/`width`/`height` became `xIn`/`yLine`/`kind`/`spec.widthIn`/`spec.heightIn`.
- Character cue width is 38 (ticket table; ticket 03 had 35). Dialogue block (cue/parenthetical/dialogue) has no blank lines between. A split note/boneyard still joins its halves.
- Basic breaking: an element that doesn't fit moves whole to the next page (so a cue can be stranded: ticket 06 replaces this); one taller than a page splits at a line.
- `displayPages(paged)` = title page + pages; `pageIndexForLine(doc, paged, line0)` index into that list for a source line; `sourceLineOf(doc, elementIndex)`.

**Golden helper:** `renderPagedText(paged)` / `renderPageText(page)` (`src/engine/pageText.ts`): `=== PAGE n ===` header, each line at column `round(xIn*10)`, page number two rows above the body. `test/paginate.test.ts` runs every `test/fixtures/paginate/*.fountain` against `test/golden/paginate/<name>.txt` (`UPDATE_GOLDEN=1 npm test` rewrites; review the diff). To extend: add a fixture and regenerate. All 11 goldens were read by eye.

**UI:** `PrintView` shows one page, no scrolling (`overflow: hidden`); right third / PgDn / Space forward, left third / PgUp / Shift+Space back (keys work while the print view is focused, so Space still types in the editor); a tap in the **middle third** on a printed line moves the editor cursor to its source line (zones take priority, so action text starting at 18% of the width is mostly in the left third — a better tap-to-jump gesture for e-ink may be wanted). The editor cursor changing page moves the print view (`pageIndexForLine`, only when the cursor's page changes). Layout (`src/ui/layout.ts`): Editor / Print / Side by side, `Ctrl+P` (or Cmd+P) cycles, saved in Preferences under `layoutMode`; default is side by side when the window is wider than 1000 px, else editor only. Page count and running time are in the doc bar and the print view's status line.

**Performance:** paginating about 120 pages takes 2 ms for 126 pages on the dev Mac (logged by the test; fails above 50 ms), so no Web Worker.

**Known limitation:** `pageIndexForLine` maps a cursor anywhere inside an element that spans two pages to the page where the element starts. Basic breaking only splits elements taller than a full page, so it is rare now; ticket 06 splits dialogue and action across pages and should track a source line per printed line (`PositionedLine`) to fix it.

**Owner checks:** tap navigation and the cursor↔page sync on the Boox itself (checked only in the desktop browser pane); A4 is only reachable through `paginate(doc, A4)` for now (no UI setting).
