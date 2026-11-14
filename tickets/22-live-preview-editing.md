---
id: 22
title: Live Preview editing
status: todo
blocked_by: [08]
model: sonnet
plan: PLAN-2.md
---

# 22: Live Preview editing

**Read first:** `PLAN-2.md` → Track B spec, stories 79–82, decisions D13, D14; ticket 07 and 08 Handoff notes; ticket 21 Handoff notes if it is done; `src/ui/elementStyles.ts`, `src/ui/variableMarks.ts`, `src/engine/pageRules.ts`.

## What to build

A second way to draw the existing editor. In **Live Preview** the text is laid out like a screenplay page and Fountain markup is hidden; the markup of the element under the cursor reappears so the real text is always editable. **Source** mode is the editor as it is today.

The document is still plain Fountain. Live Preview never changes the text: it only changes how CodeMirror draws it.

## Decisions

### What "hidden" means

Use CodeMirror decorations only (`Decoration.replace`, `Decoration.mark`, `Decoration.line`, widgets). Never edit the document to produce the preview.

An element is **active** when the cursor or any part of a selection is inside its source lines. Active elements show their full source, exactly as in Source mode but keeping the Live Preview layout (so the line doesn't jump sideways when you arrive on it). Every other element is drawn as below.

| In the source | Drawn in Live Preview (when not active) |
|---|---|
| forcing marks: leading `.`, `!`, `@`, `~`; `>` on transitions; `>` … `<` on centered | hidden |
| emphasis `*italic*`, `**bold**`, `***both***`, `_underline_` | markers hidden, text styled |
| scene number `#12A#` at the end of a heading | hidden in the text, shown in the left margin |
| dual-dialogue `^` on a cue | hidden; a small `‖` mark after the cue |
| `{{KEY}}` with a value | the value, with a thin underline so it's recognisable as a variable; in a cue, upper-cased |
| `{{KEY}}` with no value | unchanged (keeps ticket 07's dashed box) |
| notes `[[ ]]`, boneyard `/* */` | kept visible with their current styling (they don't print, but the writer needs to see them) |
| sections `#`, synopses `=` | markers hidden, current styling kept |
| page break `===` | a full-width rule |
| the title page block | collapsed to one line, `Title page: <Title> · Ctrl+T to edit`; active (expanded) when the cursor enters it |

Decide what is a marker by asking the engine, not with new regular expressions in the UI. Add a pure function to the Script Engine:

```ts
previewRanges(text: string): PreviewRange[]
// { from, to, kind: 'hide' | 'bold' | 'italic' | 'underline' | 'variable' | 'scene-number' | …, element: index }
```

built from `parse`'s source offsets, `StyleSpan`s and the variable uses from ticket 07. All the rules above are tested there, without CodeMirror.

### Layout

- The text column is 60 characters wide (the action width in `PAGE_RULES`), centred in the editor pane, in the editor's own font and size (story 60: text size doesn't follow the print spec).
- Element indents come from `PAGE_RULES`, measured relative to the action margin and expressed in `ch`: dialogue, parenthetical and character indented as on the page; transitions right-aligned; centered lines centred. Derive the CSS values from `PAGE_RULES` (set custom properties from it at start-up) so the two can't drift apart.
- Lines wrap at the element's print width (dialogue wraps at its 35 characters, and so on), so the shape of a speech on screen matches the page.
- No page breaks, page numbers, (MORE) or (CONT'D): those belong to the print view. One blank line between elements, as in the source.

### Switching modes

- `Ctrl+.`, command id `editor.mode`, label "Live Preview / Source"; also a button in the document bar showing the current mode as text.
- The setting is stored in Preferences (`editor.mode`, default `live`).
- Switching is done by reconfiguring a CodeMirror `Compartment`. The `EditorView` is **not** re-created: cursor, selection, scroll position and undo history survive (ticket 14 has the same rule for layout changes).
- If ticket 15 (Display settings) is done, add the mode there too.

### E-ink and speed

- Build decorations for the **visible lines only** (a `ViewPlugin` over `view.visibleRanges`), not the whole document.
- Moving the cursor from one element to another redraws just those two elements.
- No transitions or animations on reveal or hide.
- Typing inside an active element must cost no more than typing in Source mode: while the cursor stays in one element and only that element changes, don't rebuild the other decorations.
- Clicking or tapping hidden-markup text places the cursor at the nearest source position; arrow keys move through source positions and never get stuck on a hidden range (check Left/Right across a hidden `@`, across `**`, and across a variable).

### Working with the rest of the editor

- Spell-check marks (ticket 14), find highlights and undefined-variable boxes must still show in Live Preview. A match inside a hidden range (for example searching for `{{HERO}}`) makes that element active.
- Autocomplete, the Enter rules, Tab and Ctrl+1…8 act on the source text and work the same in both modes.
- Copy copies the Fountain source, not the drawn text.

## Acceptance criteria

- [ ] `previewRanges` tests: one case per row of the table above, plus nested emphasis, escaped `\*`, `{{KEY}}` in a cue, a forced heading with a scene number, and a script with no title page.
- [ ] A CodeMirror state test: with the cursor in an element, that element has no hide or replace decorations and every other element does; moving the cursor moves the active element.
- [ ] A state test: toggling the mode keeps the document, selection and undo history (undo after a toggle undoes the last edit).
- [ ] The indent and width CSS variables are generated from `PAGE_RULES`; a test fails if a hard-coded indent is added to the Live Preview CSS.
- [ ] Decorations are built only for the viewport: a test on a 5,000-line document asserts the decoration count is bounded by the visible range.
- [ ] `Ctrl+.` is registered in the command registry and appears in the shortcut help; the mode is restored on restart.
- [ ] (manual, browser) Open a script with emphasis, forced elements, variables and a title page. In Live Preview it reads like the print view's text; moving onto a line shows its markup; arrow keys cross hidden ranges without sticking; copy and paste give Fountain source. Screenshot both modes into the PR.
- [ ] (device) On the Boox, typing latency in Live Preview is no worse than Source mode on the ticket 02 debug panel (record both numbers in Handoff notes), and moving between lines causes no visible full-screen flash.

## Out of scope

Editing in the paged print view, showing pages or page numbers in the editor, character colours (24), a formatting toolbar, changing the Fountain text in any way.

## Handoff notes

_(Fill in: `previewRanges` kinds, the Compartment and Preferences key, how other decorations (ticket 24) should layer with these, and the latency numbers.)_
