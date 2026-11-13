---
id: 05
title: Paged print view with basic page breaks
status: todo
blocked_by: [03]
model: sonnet
---

# 05: Paged print view with basic page breaks

**Read first:** `SPEC.md` → stories 41, 43, 45–47 and *Pagination spec*; ticket 03 Handoff notes.

## What to build

Make the print view a proper paginated script. It uses the correct measurements, shows a page count and estimated running time, and is navigated by **turning pages instead of scrolling**. Page layout is checked with saved, readable expected results (golden tests) that later tickets extend.

## Decisions

- **Page spec** (one object, passed to `paginate`; US Letter is the default):

  | | US Letter | A4 |
  |---|---|---|
  | Page | 8.5 × 11 in | 8.27 × 11.69 in |
  | Top / bottom margin | 1 in / 1 in | 1 in / 1 in |
  | Body lines per page | 54 | 58 |

  Horizontal positions are the same for both (measured from the left edge of the page; Courier 12pt = 10 characters per inch, 6 lines per inch):

  | Element | Left | Width (chars) |
  |---|---|---|
  | Scene heading, action | 1.5 in | 60 |
  | Character cue | 3.7 in | 38 |
  | Parenthetical | 3.1 in | 24 |
  | Dialogue | 2.5 in | 35 |
  | Transition | right edge at 7.5 in | — |
  | Centered | centred between 1.5 and 7.5 in | 60 |
  | Page number | right edge at 7.5 in, 0.5 in from top; none on page 1 | — |

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
- **Layout modes:** *Editor only*, *Print view only*, or *Side by side* (the default when wider than 1000 px). Toggle with `Ctrl+P`. Remember the choice in Preferences.
- Pagination runs on every parse (debounced). If paginating 120 pages takes more than 50 ms on desktop, move it to a Web Worker.

## Acceptance criteria

- [ ] At least 8 golden pagination fixtures: short scene; long action that wraps; dialogue with a parenthetical; transitions; centered text; a forced page break; the title page; a script just over one page long. Each golden file has been reviewed by eye.
- [ ] A4 and US Letter give different page counts for the same 3-page fixture (tested).
- [ ] Page count and running time are shown and correct for fixtures (tested through the engine; displayed in the UI).
- [ ] Page navigation works with taps and keys; no scrollbars appear in the print view.
- [ ] Moving the editor cursor across a page boundary changes the displayed page; tapping a printed line moves the editor cursor (manual check in the browser).
- [ ] Layout mode toggles and is remembered.
- [ ] Pagination of 120 pages takes under 50 ms (benchmark logged), or runs in a worker.

## Out of scope

(MORE)/(CONT'D), orphan control, sentence splitting, dual dialogue layout, scene numbers (all ticket 06). Volume keys (ticket 15).

## Handoff notes

_(Fill in: the final PagedScript shape and the golden helper API.)_
