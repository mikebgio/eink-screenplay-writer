---
id: 07
title: Variable Drawer
status: todo
blocked_by: [04, 05]
model: sonnet
---

# 07: Variable Drawer

**Read first:** `SPEC.md` → stories 30–40 and the *Variable syntax* decision; tickets 03, 04 and 05 Handoff notes.

## What to build

The writer's signature feature. A drawer lists key → value pairs. Writing `{{KEY}}` in the script inserts the value in the print view (and later in exports). Changing a value in the drawer updates the print view **immediately**. Variables are stored **inside the `.fountain` file**, so they travel to the Mac and iPhone.

## Decisions

- **Syntax:** `{{KEY}}`, where KEY matches `[A-Z][A-Z0-9_]*`. Lowercase or invalid keys inside `{{ }}` are left as literal text, and the editor shows a hint: "Variable keys must be UPPER_CASE". `\{{` writes a literal `{{` and the backslash isn't printed.
- **Storage:** one title-page entry per variable, using the key prefix `Var-`:

  ```
  Title: The Long Night
  Author: M. G.
  Var-HERO: Jack Reyes
  Var-TOWN: Port Avalon
  ```

  - If the script has no title page, create one with just the `Var-` lines when the first variable is added.
  - The **file text is the single source of truth**: drawer edits are applied as CodeMirror edits to the title-page lines, so undo, autosave and sync all work automatically. The drawer only displays what the parser reads.
  - `Var-` entries are never printed on the title page.
  - **Check on the Mac** (Handoff note): does Beat print or keep unknown `Var-` keys? If Beat prints them on its title page, record it; the owner decides whether to accept that.
- **Engine:** `resolve(doc, { mode: 'resolve' | 'keep' })` returns a resolved document plus `diagnostics: { key, kind: 'undefined' | 'unused' | 'invalid', positions }[]`. It runs after `parse` and before `paginate`. In `resolve` mode, substitute the values into each element's display text. A value can contain spaces and punctuation; it can't contain line breaks (reject them in the drawer).
- **Character cues:** a cue like `{{HERO}}` or `{{HERO}} (V.O.)`:
  - is recognised as a character cue, even though `{{` isn't uppercase text (update the classifier and parser; add fixtures)
  - prints the value in uppercase
  - has the character identity `{{HERO}}`, so autocomplete, reports and automatic (CONT'D) treat every use as the same character even if the value changes
- **Undefined keys:**
  - the editor shows the `{{KEY}}` with a dashed box
  - the print view shows it as `{{KEY}}` with a dashed box, never as an empty string
  - the drawer lists it under "Undefined", with an [Add] button
- **Drawer UI:**
  - a side panel opened with `Ctrl+D` or a toolbar button, with no slide animation (it just appears)
  - one row per key: key, value field, usage count, [⋯] menu (Rename, Delete, Show uses)
  - an [+ Add] row at the bottom
  - editing a value applies it to the text 300 ms after typing stops
  - **Rename** changes the key in the title page and every `{{OLD}}` in the body, in **one undoable transaction**
  - **Delete** with uses still in the script asks: "Replace N uses with the current value, or leave them undefined?"
  - **Show uses** lists every place the key is used, with a short excerpt and the page number; tapping one jumps the editor and print view there
- **Autocomplete** of keys after typing `{{` is done in ticket 08. Leave an exported function `listVariableKeys(doc)` for it.
- **Speed:** a value change must update the print view within about 300 ms on the Boox. Only re-resolve and re-paginate; don't re-parse when only a title-page value changed, if that's simple to arrange. Otherwise rely on ticket 05's performance budget.

## Acceptance criteria

- [ ] Engine tests through `parse` + `resolve` + `paginate`:
  - substitution in action, dialogue and scene headings
  - an uppercase value in a cue
  - cue identity stays stable when the value changes
  - escaped `\{{`
  - an invalid lowercase key stays literal
  - undefined and unused keys appear in diagnostics
  - `keep` mode leaves `{{KEY}}` in place
  - a longer value changes line wrapping and page breaks (golden test)
- [ ] Title-page round trip: drawer edits produce the expected file text (tested on the text-transform functions, not on the UI).
- [ ] Rename updates the definition and every use; a single undo restores everything (tested on the transform; checked by hand in the UI).
- [ ] Delete-with-uses offers both options and each behaves correctly.
- [ ] The drawer shows usage counts; Show uses jumps to the right place.
- [ ] Undefined keys are visibly marked in the editor and print view.
- [ ] The `.fountain` file saved after using the drawer opens in a plain text editor with readable `Var-` lines.
- [ ] (device) A value change shows on the Boox print view in under about 0.5 s.

## Out of scope

The export-time warnings dialog and the resolve/keep toggle UI (ticket 09); key autocomplete (ticket 08).

## Handoff notes

_(Fill in: what Beat does with `Var-` keys; the final resolve API.)_
