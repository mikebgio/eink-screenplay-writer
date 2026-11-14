---
id: 08
title: Keyboard-first editing
status: needs-device
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

- [x] Unit tests for every row of the Enter and Tab tables and for every force shortcut, written as (text with a `|` cursor marker) → (expected text with cursor). Aim for 30 or more cases. *(Writing the test-case tables from these tables is Haiku-suitable.)*
- [x] Capitalising scene headings when the prefix is typed, and capitalising in character mode, are tested via the input-filter function.
- [x] Autocomplete sources are tested: frequency ordering, locations taken from the existing headings, variable keys after `{{`.
- [x] Command registry: duplicate key bindings cause an error during development; the shortcut help lists every command.
- [ ] (manual, browser) Typing a full scene with only the keyboard gives correct Fountain that parses into the expected elements.
- [ ] (device) With a Bluetooth keyboard paired, the on-screen keyboard doesn't appear; unpairing brings it back.

## Out of scope

Find and replace (14), spell-check (14), revision marks.

## Handoff notes

**Status:** the pure logic, the registry and the CodeMirror/Android wiring are built. The unit-testable criteria are ticked. The two (manual, browser) / (device) criteria are **not verified** (no file picker in the headless browser pane; no device or Android SDK here), so they stay unticked. The Java plugin was written against the Capacitor sources in `node_modules` but **not compiled** (no Android SDK).

**Pure editing (`src/engine/editing.ts`, exported from `src/engine`):** `enter(state)`, `tab(state, shift?)` (returns `null` when Tab means nothing there; the editor swallows it so focus stays), `force(state, kind)` and `capitalizeInput(before, change, mode)`. `EditState = { text, cursor, mode? }`; `Mode = 'character' | 'transition' | null` is the "capitalising mode" of the (empty) cursor line, kept in a CodeMirror `StateField` in `src/ui/editing.ts` that ends when the cursor leaves the line. Tests: `test/editing.test.ts` (about 75 table-driven cases written as `text|text` with a cursor marker, plus a keyboard-only scene that is parsed back).

**Decisions made while building (all within the ticket's tables):**
- Forcing marks are decided by asking the real parser: the candidate line is classified between blank lines (a cue is followed by a line of text) and a mark is added only if it isn't read as the wanted type. So `Jack` → `JACK` (no `@`), `007` → `@007`, `INT. HOUSE` forced to action → `!INT. HOUSE`. Ctrl+1 and Ctrl+3/6 upper-case the line; the other keys leave case alone.
- On an **empty** line Ctrl+3 / Ctrl+6 start character / transition mode (like Tab); Ctrl+4 inserts `()` with the cursor inside; Ctrl+7 inserts `>  <` with the cursor in the middle; Ctrl+8 inserts `~`; Ctrl+1/2/5 do nothing.
- Enter finishes a mode line: a cue gets `\n` (no blank), a transition gets `\n\n`. In the middle of a line, or on an empty line, Enter is a plain newline (and ends the mode). Enter just before the closing `)` of a parenthetical counts as end of line. Centered, section, synopsis and `===` behave like action; lyric, title page and notes are a plain newline.
- Shift+Tab cycles plain → transition → character → plain; Tab goes plain → character → transition → plain. Tab under a parenthetical line, or on a non-empty line, does nothing.
- Capitalising runs only for `input.type*` transactions (typing, including IME composition); paste and programmatic edits are never changed. The heading prefix regex is `HEADING_PREFIX` (`INT.`, `EXT.`, `EST.`, `INT./EXT.`, `I/E.` or `I/E `, case-insensitive): the moment it is completed the whole line is upper-cased, afterwards only typed text.
- Autocomplete (`src/engine/completions.ts`, `suggestionsAt(text, cursor, mode)`; wrapped in `src/ui/editing.ts`): character names by frequency (identity from ticket 07, so `{{HERO}}`), shown on a cue line (character mode, a `@` line or a recognised cue); heading prefixes only once two characters are typed (so ordinary action isn't interrupted); then locations from existing headings (the line being edited is excluded, split at the last ` - `); after ` - `, `DAY, NIGHT, CONTINUOUS, LATER, MOMENTS LATER, MORNING, EVENING` then any other times used. After `{{`: `listVariableKeys`, each with its value (or `undefined`). A suggestion equal to what is typed is dropped, so a finished name closes the list and Enter works normally. Tab accepts (a high-priority binding before the Tab rule); Enter and Esc use CodeMirror's completion keymap. Animations are disabled in CSS.

**Command registry (`src/ui/commands.ts`):** `registerCommand({ id, label, keys, run, scope?, inInputs?, enabled? })` returns an unregister function. `keys` is a string or array like `'Ctrl+Shift+Z'`, `'Tab'`, `'Ctrl+/'` (the Mac ⌘ key counts as Ctrl). `scope: 'editor'` commands become CodeMirror bindings (`run({ view })`); the default `global` scope is handled by a single capture-phase window listener in `App` (`commands.handleEvent`). `run` returning `false` lets the key through; `inInputs: false` skips key events from inputs and the drawer; `enabled()` can switch a command off (e.g. no document). A duplicate key throws in development/tests and is dropped with a console warning in production; registering the same `id` again replaces it (hot reload). `commands.list()` feeds the help overlay (`ShortcutHelp.tsx`, Ctrl+/).
- Registered now: `file.save` Ctrl+S, `drawer.toggle` Ctrl+D, `layout.next` Ctrl+P, `help.shortcuts` Ctrl+/, `edit.undo` / `edit.redo` Ctrl+Z / Ctrl+Shift+Z, plus Tab, Shift+Tab, Enter, Shift+Enter and Ctrl+1…8. The existing shortcuts for the snapshot name (`snapshot.name` Ctrl+Shift+S), title page (`title.form` Ctrl+T), find (`find.open` Ctrl+F) and replace (`find.replace` Ctrl+H) were moved from ad-hoc listeners in `App.tsx` into the registry.
- **Reserved for later tickets** (`RESERVED_KEYS`; registering them under another id throws): Ctrl+Shift+S → `snapshot.name` (11, already registered), Ctrl+G → `navigator.open` (13), Ctrl+E → `export.open` (09), Ctrl+F → `find.open` (14, already registered), Ctrl+Shift+D → `debug.toggle` (02). Register them with exactly these ids.
- `EditorHandle` gained `view()`.

**On-screen keyboard:** `src/platform/device.ts` (`Device.hasHardwareKeyboard()`, `watchHardwareKeyboard(cb)`; browser fallback returns false) over `android/.../DevicePlugin.java`, registered in `MainActivity`. It reads `Configuration.keyboard != KEYBOARD_NOKEYS && hardKeyboardHidden != HARDKEYBOARDHIDDEN_YES` and emits `keyboardChange` from `handleOnConfigurationChanged` (the manifest already lists `keyboard|keyboardHidden` in `configChanges`). `src/ui/hardwareKeyboard.ts` sets `inputmode="none"` on the editor content while connected.

**Owner checks:**
- (manual, browser) Type a whole scene using only the keyboard (Tab, Enter, text, Ctrl+1…8): the result is correct Fountain and styles as the expected elements. The same flow is unit-tested on the pure functions only. Also check that the suggestion list appears and Tab/Enter/Esc work, and Ctrl+/ shows the help.
- (device) With a Bluetooth keyboard paired, the on-screen keyboard doesn't appear; unpairing brings it back. The Java plugin has not been compiled: run `npm run apk`.
- Check that Ctrl+S, Ctrl+D, Ctrl+P, Ctrl+T, Ctrl+Shift+S and Ctrl+F still work after moving to the registry, and Ctrl+D is still ignored inside the drawer's inputs.
