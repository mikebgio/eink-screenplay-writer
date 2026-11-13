---
id: 08
title: Keyboard-first editing
status: todo
blocked_by: [03, 07]
model: sonnet
---

# 08: Keyboard-first editing

**Read first:** `SPEC.md` → stories 16–20, 31, 62, 63; tickets 03 and 07 Handoff notes.

## What to build

Make writing with a Bluetooth keyboard feel like Final Draft:

- Tab and Enter move between element types.
- A shortcut forces any element type.
- Scene headings, character cues and transitions are capitalised as you type.
- Autocomplete covers characters, scene headings and variables.
- Every common action has a shortcut.
- The on-screen keyboard stays out of the way when a hardware keyboard is connected.

## Key idea

The document is **plain Fountain text**. "Changing the element type" therefore means editing the text: adding or removing blank lines, Fountain forcing characters, or changing case. Every behaviour below is a pure function **(text, cursor) → (new text, new cursor)** in a module of editor commands, unit-tested without CodeMirror and then bound to keys.

## Decisions

### Enter (at the end of a line)

| Current element | Enter produces |
|---|---|
| Scene heading | blank line + new line (expect action) |
| Action | blank line + new line (action) |
| Character | new line with no blank (expect dialogue) |
| Parenthetical | new line with no blank (expect dialogue) |
| Dialogue | blank line + new line (expect action) |
| Transition | blank line + new line (expect scene heading) |

Enter in the middle of a line just splits it. Shift+Enter always inserts a plain newline.

### Tab

| Context | Tab does |
|---|---|
| Empty line after a blank line | enter **character mode**: what you type is capitalised; on Enter it becomes a cue. If the uppercase text alone wouldn't be read as a cue (e.g. it contains lowercase or digits that Fountain doesn't accept), add the `@` forcing character. |
| Empty line directly under a cue or dialogue | insert `()` with the cursor inside (parenthetical) |
| Inside a parenthetical that is empty apart from `()` | remove it, back to dialogue |
| Empty line in character mode | switch to transition mode: capitalised and forced with `>` |
| Shift+Tab | cycle backwards through the same modes |

### Force an element type

`Ctrl+1` scene heading (prefix `.` if needed), `Ctrl+2` action (`!`), `Ctrl+3` character (`@` + capitalise), `Ctrl+4` parenthetical (wrap in `()`), `Ctrl+5` dialogue, `Ctrl+6` transition (`>` + capitalise), `Ctrl+7` centered (`> <`), `Ctrl+8` lyric (`~`). Each rewrites the current line. Forcing characters are added only when Fountain wouldn't otherwise recognise the line. Running the same shortcut again on an already-forced line removes the forcing.

### Capitalising as you type

When the line is (or is in a mode to be) a scene heading, character cue or transition, capitalise input as it arrives using a CodeMirror input filter. A scene heading is detected as soon as the line starts with `int.`, `ext.`, `est.`, `int./ext.` or `i/e` (case-insensitive): capitalise the whole line at that moment. Never change the case of text the writer pastes.

### Autocomplete (`@codemirror/autocomplete`, no fade or animation)

- **Characters:** on a cue line; the names come from the parsed document, ordered by how often they appear; uses the character identity from ticket 07, so `{{HERO}}` is included.
- **Scene headings:** prefixes INT., EXT., INT./EXT., I/E., EST.; then locations already used (the text between the prefix and ` - `); after ` - `, times of day: DAY, NIGHT, CONTINUOUS, LATER, MOMENTS LATER, MORNING, EVENING, plus any already used in the script.
- **Variables:** after typing `{{`, list the keys from `listVariableKeys`, each shown with its value.
- Tab or Enter accepts a suggestion when the list is open, which takes priority over the Tab/Enter rules; Esc closes the list.

### Commands and shortcuts

Create a **central command registry** in `src/ui/`: `registerCommand({ id, label, keys, run })`. Later tickets register their commands there. Register now:

| Keys | Command |
|---|---|
| `Ctrl+S` | save now |
| `Ctrl+D` | variable drawer |
| `Ctrl+P` | change layout |
| `Ctrl+/` | shortcut help (a list of all registered commands) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |

Reserve these for later tickets: `Ctrl+Shift+S` snapshot (11), `Ctrl+G` navigator (13), `Ctrl+E` export (09), `Ctrl+F` find (14).

### On-screen keyboard

Add a small native method `hasHardwareKeyboard()` plus a change event, based on Android's keyboard configuration (`Configuration.keyboard` / `hardKeyboardHidden`). Put it in a local `Device` plugin, with a browser fallback that returns false. When a hardware keyboard is connected, set `inputmode="none"` on the editor's content so Android doesn't show the on-screen keyboard; remove it when the keyboard disconnects.

## Acceptance criteria

- [ ] Unit tests for every row of the Enter and Tab tables and for every force shortcut, written as (text with a `|` cursor marker) → (expected text with cursor). Aim for 30 or more cases. *(Writing the test-case tables from these tables is Haiku-suitable.)*
- [ ] Capitalising scene headings when the prefix is typed, and capitalising in character mode, are tested via the input-filter function.
- [ ] Autocomplete sources are tested: frequency ordering, locations taken from the existing headings, variable keys after `{{`.
- [ ] Command registry: duplicate key bindings cause an error during development; the shortcut help lists every command.
- [ ] (manual, browser) Typing a full scene with only the keyboard gives correct Fountain that parses into the expected elements.
- [ ] (device) With a Bluetooth keyboard paired, the on-screen keyboard doesn't appear; unpairing brings it back.

## Out of scope

Find and replace (14), spell-check (14), revision marks.

## Handoff notes

_(Fill in: the command registry API, and the commands reserved for later.)_
