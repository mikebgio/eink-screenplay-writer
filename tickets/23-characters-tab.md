---
id: 23
title: Characters tab
status: todo
blocked_by: [07, 08]
model: sonnet
plan: PLAN-2.md
---

# 23: Characters tab

**Read first:** `PLAN-2.md` → Track B spec, stories 83–86, decisions D15, D16; ticket 07 Handoff notes (cue identity, `Var-` storage, rename), ticket 08 (`characterNames`, command registry), ticket 14 (`updateTitlePage`, `asUndoStep`); `src/engine/variableEdits.ts`, `src/ui/VariableDrawer.tsx`.

## What to build

A Characters tab in the drawer: the list of everyone who speaks, with a description and (for ticket 24) a colour per character, stored in the script file. Rename a character once and every cue follows.

## Decisions

### Storage (D15)

One title-page entry per defined character:

```
Char-JACK: blue
    Ex-teacher, mid-40s. Hasn't slept.
    Wants: to finish the play.
```

- Key: `Char-` + the cue **identity** from ticket 07 (the name without extensions, as written; `{{HERO}}` for a variable cue).
- First line of the value: a palette colour name or `none`. This ticket always writes `none` unless a colour is already there; ticket 24 adds the picker. Unknown words are read as `none` and kept as written.
- Indented lines after it: the description, free text, any number of lines.
- An entry is created only when a description or colour is set, and removed when both are cleared. A character with no entry is still listed.
- `Char-` entries never print and are dropped from exports with variables resolved, like `Var-` entries. Put them after the `Var-` entries.

Before building, check that a title-page key containing `{{` and `}}` survives `parse` → `updateTitlePage` → `parse`. If it doesn't, write the key as `Char-$HERO` instead and note it in Handoff notes.

### Script Engine (pure, tested)

In a new `src/engine/characters.ts`:

- `listCharacters(text): CharacterInfo[]`: every identity that has a cue, merged with every `Char-` entry.
  - `identity`, `displayName` (variable resolved, upper-case), `color`, `description`
  - `speeches` (number of cues), `dialogueWords`, `scenes` (number of scenes with a cue), `firstLine` (source line of the first cue)
  - `defined` (has an entry), `unused` (has an entry, no cue)
  - order: by `speeches`, most first; unused entries last
- `setCharacter(text, identity, { color?, description? }): EditResult`: creates, updates or removes the entry, as source-offset changes (the same shape as the variable edits, so the UI applies it as one undo step).
- `renameCharacter(text, from, to): EditResult`: rewrites every cue with that identity, keeping extensions (`JACK (V.O.)` → `JOHN (V.O.)`), the dual-dialogue `^` and any `@` forcing mark (add or drop the `@` as the new name requires, using the same test `force` uses), and renames the `Char-` entry. It does **not** change the name inside dialogue or action. It refuses when `to` is already another character (the UI then offers **Merge**, which is the same rewrite but keeps the target's entry).
- Renaming a variable-cue character (`{{HERO}}`) is refused with a message pointing to the Variables tab.

`characterNames` (autocomplete, ticket 08) and the spell-check word list (ticket 14) keep working from cues; add defined-but-unused names to both, so a character you've defined is offered before their first line.

### The drawer (D16)

- The drawer gets a two-tab header: **Variables** | **Characters**. Rename the component and its command label from "Variable drawer" to "Drawer"; `Ctrl+D` opens it on the last-used tab. New command `drawer.characters`, `Ctrl+Shift+C`, opens it on Characters.
- Characters tab, monochrome, 44 px targets, no animation:
  - one row per character: name, `speeches` and `scenes` counts; unused ones marked "not in script"
  - select a row to expand it: description (multi-line text field), [Rename], [Go to first line], [Next line] (steps through that character's cues, turning the print view to the page as the variable "jump to use" does)
  - [Add character] creates an entry for someone who hasn't spoken yet
  - a filter field at the top once there are more than 12 characters
- Edits save on blur or Enter as one undoable step each. The list re-reads from the document after every parse, so typing a new cue in the editor adds a row.

## Acceptance criteria

- [ ] `listCharacters` tests: counts for a fixture script; extensions and `(CONT'D)` don't create separate characters; a variable cue is one character; defined-but-unused entries are listed last and flagged.
- [ ] `setCharacter` tests: create, change description, multi-line description, clear (entry removed), and `Var-` and unknown title-page keys untouched and in order; creating the first entry in a script with no title page.
- [ ] `renameCharacter` tests: extensions, dual dialogue and forcing marks kept; a name that needs `@` gets it; dialogue text mentioning the name is untouched; the entry is renamed; rename onto an existing character is refused and merge combines them; a variable cue is refused.
- [ ] Exports with variables resolved contain no `Char-` lines (extend the existing resolve test).
- [ ] Autocomplete and spell-check accept a defined character who hasn't spoken yet.
- [ ] `Ctrl+Shift+C` is registered, appears in the shortcut help, and `Ctrl+D` is still ignored inside the drawer's inputs.
- [ ] (manual, browser) Add a description, rename a character with a `(V.O.)` cue, undo it with one Ctrl+Z, jump through their lines, and reopen the file: the description is still there.
- [ ] (manual) Open the saved file in another Fountain editor (Beat on the Mac), save it, and reopen it here: the `Char-` entries survive. Record the result in Handoff notes.

## Out of scope

The colour picker and coloured lines (24). Structured bios (age, role, arc), relationship maps and the character report (ticket 13 owns reports; it may reuse `listCharacters`). Renaming names inside dialogue and action (find and replace does that). Non-speaking characters detected from action text.

## Handoff notes

_(Fill in: the `CharacterInfo` shape, the final key format for variable cues, and the drawer tab API ticket 24 adds the picker to.)_
