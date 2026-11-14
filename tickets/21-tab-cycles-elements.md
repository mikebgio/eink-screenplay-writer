---
id: 21
title: Tab cycles through script elements
status: todo
blocked_by: [08]
model: sonnet
plan: PLAN-2.md
---

# 21: Tab cycles through script elements

**Read first:** `PLAN-2.md` → Track B spec, stories 76–78, decision D12; ticket 08 Handoff notes (`tab`, `force`, `Mode`, the command registry); `src/engine/editing.ts`.

## What to build

Tab changes the cursor line to the next element type; Shift+Tab to the previous. It works on a line that already has text, not only on an empty one. A small indicator shows the current element type.

**This replaces the Tab table in ticket 08** (owner's decision, D12). The Enter table and Ctrl+1…8 are unchanged.

## Decisions

### The cycle

Tab picks the cycle from where the cursor line sits:

| The line is… | Tab order (Shift+Tab reverses) |
|---|---|
| the start of a block: the first line, or the line above is blank | action → scene heading → character → transition → action |
| directly under a cue, a parenthetical or dialogue | dialogue → parenthetical → dialogue |
| anything else (title page, inside a note or the boneyard, section, synopsis, page break) | Tab does nothing (and is swallowed, so focus stays in the editor) |

The starting point is the line's **current** type as the parser reads it. A centered or lyric line counts as action for this purpose, so the first Tab makes it a scene heading.

### Lines with text

Each step rewrites the line with the existing `force(state, kind)`, so forcing marks are added only when Fountain wouldn't read the line that way, and capitals are applied for scene heading, character and transition exactly as Ctrl+1/3/6 do.

**Cycling must not lose the writer's capitals** (story 78). `He runs.` → `HE RUNS.` (scene heading) must come back as `He runs.` when the cycle returns to action. Keep the line's original text for as long as the cycle lasts: a `cycleOrigin` value in the editing state (next to `mode`), set on the first Tab, used as the source text for every later step, and cleared when the cursor leaves the line or the line is edited any other way. In the pure function this is an extra optional field on `EditState`.

Each Tab press is one undo step (`asUndoStep`).

### Empty lines

An empty line has no text to rewrite, so Tab changes the **mode**, as now, with one more value: `Mode = 'scene-heading' | 'character' | 'transition' | null`.

- Block-start empty line: plain (action) → scene-heading mode → character mode → transition mode → plain.
- In scene-heading mode, typing is capitalised; on Enter the line is forced with `.` only if the parser wouldn't read it as a heading; Enter then behaves as the scene-heading row of ticket 08's Enter table.
- Empty line under a cue or dialogue: Tab inserts `()` with the cursor inside (parenthetical); Tab inside an empty `()` removes it (dialogue). This is ticket 08's behaviour, kept.

### What stays

- When the autocomplete list is open, Tab accepts the suggestion (higher priority, as now).
- Tab never inserts a tab character and never moves focus out of the editor.

### Element indicator

Show the cursor line's element type as text at the right of the document bar (`Action`, `Scene heading`, `Character`, `Parenthetical`, `Dialogue`, `Transition`, …). In a mode on an empty line it shows the pending type. It's plain text, not colour, and updates only when the type changes (no redraw on every keystroke: e-ink).

### Help text

Update the labels in the shortcut help (Ctrl+/): `Tab` "Next element type", `Shift+Tab` "Previous element type".

## Acceptance criteria

- [ ] Pure-function tests in the `text|cursor` style of `test/editing.test.ts`: every step of both cycles, forwards and backwards, on lines with text; at least 25 cases. *(Writing the case tables from the table above is Haiku-suitable.)*
- [ ] A full cycle on a mixed-case line returns the exact original text and cursor column; editing the line mid-cycle makes the edited text the new origin.
- [ ] Lines needing forcing marks are covered: `007` as character (`@007`), `Fade out` as transition (`>FADE OUT`), `INT. HOUSE` as action (`!INT. HOUSE`), and the marks are removed again on the next step.
- [ ] Empty-line tests: the four-step mode cycle; scene-heading mode capitalises and Enter completes it; `()` insert and remove under a cue.
- [ ] Tab does nothing (returns `null`) on title-page lines, sections, synopses and inside notes and the boneyard.
- [ ] The tests from ticket 08 that describe the old Tab table are updated or removed; the Enter and force tests still pass unchanged.
- [ ] The element indicator is tested through a pure `elementLabel(text, cursor, mode)` function.
- [ ] (manual, browser) Type a line, press Tab four times: it passes through scene heading, character and transition and returns as typed. The indicator follows. With the suggestion list open, Tab accepts the suggestion instead.

## Out of scope

Changing Enter, new element types in the cycle (centered and lyric stay on Ctrl+7/8), converting a block-start line into dialogue by deleting the blank line above it, Live Preview (22).

## Handoff notes

_(Fill in: the final `EditState` shape, how `cycleOrigin` is cleared, and where the indicator reads its value. Ticket 22 edits `src/ui/editing.ts` too.)_
