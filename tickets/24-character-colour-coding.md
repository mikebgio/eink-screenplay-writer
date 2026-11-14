---
id: 24
title: Colour-coded character lines
status: todo
blocked_by: [22, 23]
model: sonnet
plan: PLAN-2.md
---

# 24: Colour-coded character lines

**Read first:** `PLAN-2.md` → Track B spec, stories 87–89, decision D17; `SPEC.md` story 59; ticket 22 and 23 Handoff notes.

## What to build

Give a character a colour in the Characters tab, and mark that character's cues and dialogue with it in the editor. Optionally show the same marks in the on-screen print view. Highlight everyone with a colour, or focus on just a few.

## Decisions

### Palette (D17)

Eight fixed slots. Each has a name (the word stored in the file), a colour and a **bar pattern**, so slots differ without colour:

| Name | Pattern of the margin bar |
|---|---|
| `red` | solid |
| `blue` | dashed |
| `green` | dotted |
| `orange` | double |
| `purple` | solid, with a notch every line |
| `teal` | dash-dot |
| `brown` | thick-thin pair |
| `grey` | wide dots |

- Choose the hex values on the device, not on a monitor: Kaleido 3 shows about 4,096 colours at low saturation, so pick strong, dark, well-separated hues. Start from a candidate set, look at it on the Boox, adjust, and record the final values in `src/ui/characterPalette.ts` and in Handoff notes.
- The patterns must be drawable with CSS borders or gradients (no images), and legible at the smallest editor text size.

### What gets marked

For a character with a colour, in the **editor** (both Source and Live Preview):

- every line of their dialogue blocks (cue, parentheticals, dialogue) gets the bar in the left margin, 6 px wide, in the slot's colour and pattern
- the cue text is underlined in the slot's colour
- no background tint, and the text colour stays black (or white in the dark theme)
- dual dialogue: each side gets its own character's bar

Which lines belong to whom comes from a pure engine function:

```ts
characterLines(text: string): { identity: string; fromLine: number; toLine: number }[]
```

The UI maps identity → slot through `listCharacters` and adds line decorations for the visible range only. These layer on top of ticket 22's decorations following its Handoff notes; they are a separate extension, so turning colours off doesn't touch Live Preview.

### Choosing what to show

- **Characters tab:** each expanded row gets a row of eight swatches (each showing its pattern and name) plus **None**. Picking one calls `setCharacter(…, { color })`. A swatch already used by another character is still allowed but shows that character's name next to it.
- **View filter**, a control at the top of the Characters tab, stored per script in Preferences (it's a view setting, so it doesn't go in the file):
  - **All coloured** (default): every character with a colour is marked
  - **Only selected**: a checkbox on each row; only ticked characters are marked. This is "follow one character".
  - **Off**: no marks
- Command `characters.colours`, `Ctrl+Shift+U`, cycles All → Only selected → Off; add it to the shortcut help.

### Print view

- A setting, off by default: "Show character colours in the print view". When on, the on-screen print view draws the same margin bar beside that character's lines, outside the text block, so the layout doesn't move.
- **PDF, FDX and Fountain exports never contain colour or bars**, whatever the setting. Add a test to each exporter that exists when this ticket is built.

### E-ink

- Changing a colour or the filter redraws once, followed by one full refresh through the refresh policy (ticket 02), so the old bars don't ghost.
- Typing in a coloured block must not add work per keystroke beyond what ticket 22 already does: decorations are per line and only for visible lines.

## Acceptance criteria

- [ ] `characterLines` tests: a simple exchange, parentheticals, a speech continued after action (a new block), dual dialogue, extensions, a variable cue.
- [ ] A CodeMirror state test: with two coloured characters, their lines carry the right slot classes; **Only selected** leaves just the ticked character's; **Off** leaves none.
- [ ] Each palette slot has a distinct pattern class; a test asserts no two slots share a pattern.
- [ ] Picking a colour writes `Char-NAME: <colour>` and is one undo step; **None** on a character with no description removes the entry.
- [ ] Exports contain no colour or bars with the print-view setting on.
- [ ] `Ctrl+Shift+U` is registered and listed in the shortcut help.
- [ ] (manual, browser) Colour three characters; set the browser to greyscale (DevTools rendering emulation) and confirm the three are still distinguishable by pattern. Screenshot into the PR.
- [ ] (device) On the Boox: the eight colours are distinguishable from each other, text contrast is unchanged, and changing a colour leaves no ghosting after the refresh. Record the final hex values.
- [ ] (device) Typing latency in a coloured dialogue block is no worse than in an uncoloured one (ticket 02 debug panel; record both).

## Out of scope

Custom colours, colouring action lines that mention a character, colour-coded storylines and scenes (Phase 2), coloured PDF "sides" for actors, colours in the scene navigator.

## Handoff notes

_(Fill in: the final palette, the class names, and the Preferences keys for the filter and the print-view setting.)_
