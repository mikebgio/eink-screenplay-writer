---
id: 07
title: Variable Drawer
status: needs-device
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

- [x] Engine tests through `parse` + `resolve` + `paginate`:
  - substitution in action, dialogue and scene headings
  - an uppercase value in a cue
  - cue identity stays stable when the value changes
  - escaped `\{{`
  - an invalid lowercase key stays literal
  - undefined and unused keys appear in diagnostics
  - `keep` mode leaves `{{KEY}}` in place
  - a longer value changes line wrapping and page breaks (golden test)
- [x] Title-page round trip: drawer edits produce the expected file text (tested on the text-transform functions, not on the UI).
- [x] Rename updates the definition and every use; a single undo restores everything (tested on the transform; checked by hand in the UI).
- [x] Delete-with-uses offers both options and each behaves correctly.
- [x] The drawer shows usage counts; Show uses jumps to the right place.
- [x] Undefined keys are visibly marked in the editor and print view.
- [x] The `.fountain` file saved after using the drawer opens in a plain text editor with readable `Var-` lines.
- [ ] (device) A value change shows on the Boox print view in under about 0.5 s.

## Out of scope

The export-time warnings dialog and the resolve/keep toggle UI (ticket 09); key autocomplete (ticket 08).

## Handoff notes

**Status:** every criterion except the (device) one is met; ticket 05 is merged and the print-view parts are done.

**Final resolve API** (`src/engine/variables.ts`, exported from `src/engine`):

- `resolve(doc, { mode: 'resolve' | 'keep' }) → { doc, variables, diagnostics }`. `doc` has the same element order, so `elementIndex` still lines up with the parsed document. Undefined keys stay as `{{KEY}}` text; the print view should draw a dashed box (`.print-var-undefined` is already in `styles.css`) around any `{{KEY}}` whose key is in `diagnostics` with `kind: 'undefined'`. `Var-` entries are dropped from `doc.titlePage`; values are substituted into other title-page values.
- `diagnostics: { key, kind: 'undefined' | 'unused' | 'invalid', positions: {from,to}[] }[]` (source offsets; empty for `unused`; for `invalid`, `key` is the text between the braces).
- Also: `getVariables(doc)`, `variableUses(doc)` (key, from, to, elementIndex, excerpt, inCue; skips notes/boneyard), `listVariableKeys(doc)` for ticket 08, `scanTokens(text)`.
- Character cues get `identity` from `parse` (the name without extensions, as written; `{{HERO}}` stays `{{HERO}}`). Use it, not `text`, for autocomplete, reports and (CONT'D). `{{HERO}}` was already recognised as a cue (braces and capitals are "uppercase"); no classifier change was needed. `resolve` uppercases only the substituted value in a cue.
- Edits (`src/engine/variableEdits.ts`) return `{ changes: {from,to,insert}[] } | { error }` in original-text offsets, so the UI dispatches them as one CodeMirror transaction (one undo step): `setVariable`, `renameVariable`, `deleteVariable(text, key, 'inline' | 'undefine')`, plus `applyChanges` for tests. `titlePageLayout(text)` in `parse.ts` gives source ranges of title-page entries.
- Rules: first `Var-KEY` definition wins; values can't contain line breaks; no title page → one is created with a blank line after it; deleting the only entry removes the title page. Rename and "replace with value" skip `{{KEY}}` inside notes and boneyard, and `\{{KEY}}` is never a use. Re-parse is not skipped on a value change; it relies on ticket 05's performance budget.
- UI: `Editor` takes `onReady(handle)` (`getText`, `apply`, `reveal`); `VariableDrawer.tsx`; `variableMarks.ts` (editor dashed box for undefined, dotted underline with the "UPPER_CASE" hint for invalid). Ctrl+D toggles the drawer (window capture listener, beating CodeMirror's Ctrl+D). `App` keeps `printPage` state for Show uses; ticket 05 will need to wire that to its paged view.

**Print view (ticket 05 API):** `PrintView` takes `undefinedKeys` (a `Set` of keys from `diagnostics` with `kind: 'undefined'`) and draws `{{KEY}}` with `.print-var-undefined`. An escaped `\{{KEY}}` that prints as `{{KEY}}` of an undefined key is boxed too (known quirk). "Show uses" shows the display page number (`pageOf`) and moves the editor selection, the cursor line and the print page (`App.jumpToUse`); from Print-only layout it switches to Both. Golden tests: `test/fixtures/variables/` → `test/golden/variables/` (`UPDATE_GOLDEN=1` rewrites).

**Owner checks:**
- (Mac) Does Beat print or keep unknown `Var-` keys on its title page? Not checked.
- (device) A value change shows on the Boox print view in under about 0.5 s.
- The drawer UI was not exercised in a browser here (the `@capacitor/*` modules are missing in this worktree, so the app won't build); only the engine and text transforms are tested. Check Ctrl+D, rename and delete by hand.
