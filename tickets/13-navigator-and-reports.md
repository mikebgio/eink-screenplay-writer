---
id: 13
title: Scene navigator and reports
status: todo
blocked_by: [05]
model: haiku
---

# 13: Scene navigator and reports

> **Model:** Haiku-suitable. The engine work is simple aggregation over the parsed document, and the UI is lists. Switch to Sonnet if linking the navigator to the editor and print view gets tricky.

**Read first:** `SPEC.md` → stories 48–51, 66, 67; tickets 03 and 05 Handoff notes (element types, `PagedScript`, `elementIndex`). If ticket 07 is done, read its notes on character identity (`{{HERO}}` cues).

## What to build

1. A **scene navigator**: a panel listing sections, synopses and scenes (number, heading, page) that you tap to jump to.
2. **Jump to page.**
3. A **character filter** on the navigator.
4. Two **reports**: characters and locations.

## Decisions

- **Engine (pure):**
  - `outline(doc, paged): OutlineItem[]`, where each `OutlineItem` is a `section` (level, title), `synopsis` (text) or `scene`: `{ elementIndex, heading, sceneNumber, page, characters: string[] }`.
    - Get the page by finding the first `PositionedLine` whose `elementIndex` is the heading.
    - `characters` is every character identity that speaks in the scene. Use the cue text without its extension (`MAYA (V.O.)` → `MAYA`), or the `{{KEY}}` identity if ticket 07 is done.
  - `report(doc, paged)`, returning:
    - `characters: { name, speeches, dialogueWords, scenes, firstPage }[]`, sorted by speeches, most first. Speeches = the number of dialogue blocks. Dialogue words count only dialogue text (not parentheticals) after variables are filled in.
    - `locations: { location, scenes, intExt: {INT, EXT, 'INT./EXT.'}, times: Record<string, number>, pages }[]`.
      - Parse each heading as `<PREFIX> <LOCATION> - <TIME>`; if there's no ` - `, the time is "UNSPECIFIED".
      - Treat locations case-insensitively and trim them; keep the first spelling for display.
      - `pages` = the sum of each scene's length in eighths of a page (a scene runs from its heading to the next heading). Show it as `1 3/8`.
- **Navigator panel** (`Ctrl+G`; register it in the command registry if ticket 08 is done, otherwise add a toolbar button):
  - Sections are indented by level and shown bold; synopses are italic under the scene that follows them.
  - Scenes show `12A  INT. KITCHEN - NIGHT …… p. 34`.
  - The list is **paged** (shows as many items as fit; PgUp/PgDn and tap zones turn pages), never scrolled.
  - The current scene (where the editor cursor is) is marked with a ▶, not with colour.
  - Tapping a scene: the editor cursor goes to the heading's line, the print view goes to its page, and the panel closes (on narrow screens) or stays open (in side-by-side layout).
  - **Character filter:** a select box at the top ("All characters" plus the names from the report). When a character is chosen, only scenes where they speak are listed, and sections are kept only if they still contain matching scenes.
  - **Jump to page:** a number field with a [Go] button at the top, also `Ctrl+Shift+G`. It accepts a page number between 1 and the page count; anything else shows an inline error.
- **Reports screen:** two tables (Characters, Locations), monochrome, paged, with sortable column headers (tap to sort; ▲/▼ shows the direction). Add a [Copy as text] button that copies a plain-text version, for pasting into notes.

## Acceptance criteria

- [ ] Engine tests on fixtures:
  - the outline lists sections, synopses and scenes in order, with the right page numbers (use a fixture that spans 3+ pages)
  - scene numbers are carried through
  - the scene character list ignores extensions
  - report speech and word counts match hand-counted fixture numbers
  - locations merge regardless of case
  - INT/EXT and time-of-day counts are right
  - eighth-of-a-page lengths add up to the total page count (within 1/8 per scene, due to rounding)
- [ ] The navigator jumps the editor and print view to the right place (manual browser check, plus a component test if simple).
- [ ] The character filter reduces the list correctly (tested on the filtering function).
- [ ] Jump to page validates its input.
- [ ] The reports screen sorts by every column; Copy as text gives aligned plain text.
- [ ] No scrollbars appear in the navigator or reports on a 1240×1860 viewport (the Boox's resolution): check it in the browser's device mode.

## Out of scope

Index cards and the outline editor (Phase 2), production breakdown reports (Phase 4).

## Handoff notes

_(Fill in: anything that surprised you about the data.)_
