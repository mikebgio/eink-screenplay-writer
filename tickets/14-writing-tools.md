---
id: 14
title: Writing tools
status: todo
blocked_by: [03]
model: sonnet
---

# 14: Writing tools

**Read first:** `SPEC.md` → stories 26–29; ticket 03 Handoff notes. If tickets 07 and 08 are done, read their Handoff notes too (variable keys, command registry).

## What to build

Four everyday tools:

1. A **title page editor**
2. **Find and replace**
3. **Spell-check** that learns names from the script
4. **Undo/redo** that holds up for a whole writing session

Each is independent, so do them in this order and commit after each one.

## 1. Title page editor

- A form (opened from the menu, or `Ctrl+T` via the command registry if it exists) with these fields: Title, Credit (default "Written by"), Author, Source, Draft date (a date picker plus free text, e.g. "Second Draft – 12 Nov 2026"), Contact (several lines), Notes.
- It reads from and writes to the parsed `titlePage`, as **CodeMirror edits to the title block**, in one undoable transaction per [Save].
- **Keep every other key unchanged and in its original order:** `Var-*` (ticket 07), unknown keys from other apps. Write a pure function `updateTitlePage(text, changes): text` and test it thoroughly.
- Values that span several lines are written in Fountain's indented continuation format (3 spaces or a tab).
- If the script has no title page, saving the form creates one at the top.

## 2. Find and replace

- Use `@codemirror/search` with a custom panel (monochrome, no animation, larger tap targets: at least 44 px):
  - find field, replace field
  - toggles: **Match case**, **Whole word**, and **Include notes and boneyard** (off by default: matches inside notes and boneyard are skipped)
  - a result count: "3 of 17"
  - [Previous] [Next] [Replace] [Replace all]
- **Replace all** is one undoable transaction.
- Moving to a match puts the cursor on it **without smooth scrolling**. If the print view is visible, it turns to the page of the match.
- Shortcuts: `Ctrl+F` find, `Ctrl+H` replace, `Enter`/`Shift+Enter` next/previous, `Esc` close.

## 3. Spell-check

- Turn off the WebView's built-in spell-check on the editor (`spellcheck="false"`), to avoid red underlines from Android that can't be controlled or synced.
- Use `nspell` with a bundled Hunspell `en_US` dictionary (e.g. the `dictionary-en` package). Load it lazily in a Web Worker so startup isn't slowed.
- **Words to accept, rebuilt after each parse:** character names (cue text without extensions), words from scene-heading locations, variable keys and values, the title-page Author and Title, and the writer's personal dictionary.
- **Personal dictionary:** stored in Capacitor Preferences; "Add to dictionary" from the suggestion menu. Optional: also store it in the script as a title-page key `Dictionary: word1, word2` so it travels with the script. **Do this only with a setting, off by default**, and note it in Handoff notes.
- **What's checked:** only action, dialogue, parenthetical, scene headings and lyrics. Skip notes, boneyard, sections, synopses, `{{KEY}}` and anything all-caps of 2 or more letters (acronyms and cues).
- Mark a misspelling with a **dotted underline** (monochrome). Long-press or right-click shows up to 5 suggestions, plus [Add to dictionary] and [Ignore in this script].
- **Speed:** check only the visible lines plus a margin, debounced 300 ms after typing stops. Never block typing.
- Contractions and apostrophes: handle both the straight `'` and the curly `’` correctly. Add a test.

## 4. Undo/redo

- CodeMirror's `history()` is already in place. Check and set:
  - `minDepth` of at least 10,000
  - grouping so a typing burst undoes as one step, but separate words in a pause longer than 1 s are separate steps (`newGroupDelay: 1000`)
- Make sure every programmatic change from other tickets (drawer edits, renames, restores, replace all, title page saves, force-element commands) is **one** undo step. Add `userEvent` annotations so the history groups them correctly.
- Undo history must survive autosave, and must survive switching between editor-only and side-by-side layouts (the editor must not be re-created on a layout change).

## Acceptance criteria

- [ ] `updateTitlePage` tests: adding, changing and clearing each field; keeping `Var-*` and unknown keys in their original order; multi-line values; creating a title page where none existed.
- [ ] Find tests on the search function: case and whole-word options; notes and boneyard excluded by default; replace all as a single undo (checked through a CodeMirror state test).
- [ ] Spell-check tests (in a worker or with a direct call): the script's character names, locations and variable values aren't flagged; a misspelled common word is flagged with suggestions; acronyms and `{{KEY}}` are skipped; curly-apostrophe contractions pass.
- [ ] Undo depth and grouping are configured; switching layout keeps the undo history (manual browser check).
- [ ] (device) Spell-check doesn't make typing on the Boox noticeably slower (compare with ticket 02's latency debug screen numbers before and after; record them in Handoff notes).

## Out of scope

Grammar checking, dictionaries for other languages (leave a setting for the dictionary language, but ship only en_US), thesaurus.

## Handoff notes

_(Fill in: latency before and after spell-check; whether the in-script dictionary setting was built.)_
