---
id: 11
title: Snapshots and comparing drafts
status: needs-device
blocked_by: [04]
model: sonnet
---

# 11: Snapshots and comparing drafts

**Read first:** `SPEC.md` → stories 7–11 and the *Snapshots* decision; `PLAN.md` → *Decision log* D1; ticket 04 Handoff notes (does Drive support folder access?).

## What to build

Draft history the writer can rely on:

- named snapshots on demand, and automatic snapshots
- a browser listing them
- restoring a snapshot, which never destroys the current text
- a line-by-line comparison of any snapshot with the current draft
- pruning, so the history doesn't grow without limit

Snapshots are plain `.fountain` files, so they're readable anywhere.

## Decisions

- **Where snapshots live:**
  - *Workspace-folder mode:* a sidecar folder next to the script, named `.<script-name>.snapshots/` (e.g. `.the-long-night.snapshots/`), so it syncs with the script. The leading dot hides it on the Mac.
  - *Single-file mode* (no folder access): app-private storage (Capacitor Filesystem `Directory.Data`), under a key derived from the file URI. In this mode the browser shows a notice: "Snapshots for this file are stored on this device only."
  - Both modes go through the `sidecar(ref)` part of the Storage port (add an app-private implementation of it). **Test only against `MemoryStorage`.**
- **File name:** `<UTC ISO timestamp with ':' replaced by '-'>--<kind>[--<label-slug>].fountain`, e.g. `2026-11-12T21-30-05Z--auto.fountain` or `2026-11-12T21-41-00Z--named--before-act-3-rewrite.fountain`. Kinds: `auto`, `named`, `pre-restore`, `pre-conflict` (used by ticket 12). The label is stored in full in a first-line comment `[[snapshot: <label>]]`, so it survives the slug.
- **When snapshots are taken:**
  - `named`: `Ctrl+Shift+S` (register in the command registry from ticket 08, if it exists; otherwise add a button) → asks for a label.
  - `auto`: when a file is opened (if its text differs from the latest snapshot), and every 10 minutes of editing (only if the text changed since the last snapshot).
  - `pre-restore`: always taken automatically before a restore.
  - Never write two snapshots with the same content one after another (compare a hash).
- **Pruning** (runs after each auto snapshot). Named, pre-restore and pre-conflict snapshots are **never** pruned. Auto snapshots keep:
  - everything from the last 24 h
  - the newest one per hour for the last 7 days
  - the newest one per day for the last 30 days
  - the newest one per week after that

  Write this as a pure function `selectPrunable(snapshots, now): Snapshot[]` and test it.
- **Comparing:** add `diff(a: string, b: string): Hunk[]` to the Script Engine (line-level; the `diff`/jsdiff npm package is allowed because it's pure JS). Each hunk: `{ kind: 'equal' | 'add' | 'remove', lines: string[] }`.
  - Show the comparison one page at a time, never scrolling.
  - Removed lines: prefixed `−` and struck through. Added lines: prefixed `+` and bold. Unchanged runs longer than 6 lines are collapsed to "… n unchanged lines …".
  - It must be monochrome; colour may be added on top but must never be the only signal.
- **Snapshot browser:**
  - a panel listing snapshots newest first: date and time, kind, label, a line count difference against the current draft (e.g. "+42 −17")
  - actions per snapshot: [Compare] [Restore] [Delete] (only named snapshots can be deleted manually, after confirming)
  - **Restore:** take a pre-restore snapshot, then replace the editor's text in one undoable transaction, and show "Restored <label>. Previous version saved as a snapshot."

## Acceptance criteria

- [x] `SnapshotService` tests against `MemoryStorage`:
  - named snapshot written with the label
  - auto on open only when the text differs
  - auto every 10 minutes only when changed (fake timers)
  - no duplicates in a row
  - restore writes pre-restore first, then replaces the text
  - single-file mode uses app-private storage
- [x] `selectPrunable` tests cover every tier, at the boundaries (exactly 24 h, 7 d, 30 d), and never select non-auto snapshots.
- [x] `diff` tests: identical text, pure add, pure remove, a mixed change in the middle, and the collapse of unchanged runs in the view model.
- [x] File names sort chronologically and survive a round trip through the name parser.
- [ ] (manual, browser) Take a named snapshot, edit, compare, restore, then undo the restore.
- [ ] (device) In workspace-folder mode, the snapshot folder appears in Drive or the local folder, and a snapshot `.fountain` opens on the Mac.

## Out of scope

Conflict handling (12), revision colours and locked pages (Phase 3).

## Handoff notes

- **API for ticket 12:** `SnapshotService` (`src/storage/snapshots.ts`). `attach(ref, text, getText)` on open (safe against being superseded by a later `attach`/`detach`; takes the on-open auto snapshot and starts the 10-minute timer), `detach()`, `take(text, kind, label?)`, `list()`, `entries()`, `read(s)`, `restore(s, currentText)`, `remove(s)`. Ticket 12 calls `snapshots.take(localText, 'pre-conflict')` before replacing or overwriting anything. `take` returns `null` (nothing written) when the text equals the previous snapshot; named snapshots are always written.
- **Sidecar folder:** `.<script-name>.snapshots/` (only a trailing `.fountain` is dropped from the name; other extensions stay so files never share a folder; unsafe characters are replaced and a hash of the original name is added). The Storage port's `sidecar(ref)` now scopes by script name; `DocumentStorePlugin.java` takes a `dir` argument (default stays `.scriptwriter`) and `NativeStorage` passes `snapshotDirName(ref.name)`. Browser backends return `null`, so they use app-private storage (`privateSnapshotStore`, Capacitor `Directory.Data`) and show the device-only notice.
- **Diff:** own LCS in `src/engine/diff.ts` (no `diff` npm package added). `diff`, `diffStats`, `diffRows` (collapse runs over 6 lines). Comparison paginates 24 rows per page with Prev/Next.
- `syncHash` moved from `memory.ts` to `port.ts` (re-exported from `memory.ts`); the service uses it for content dedupe because `crypto.subtle` can't be driven by fake timers.
- Restore replaces the whole editor text in one CodeMirror transaction (one undo step). `Ctrl+Shift+S` opens the Snapshots panel with the name field focused (no command registry exists yet), and there is a Snapshots button in the header.
- **Owner checks:** (manual, browser) take a named snapshot, edit, compare, restore, then undo the restore. (device) In workspace-folder mode the `.<script>.snapshots` folder appears in Drive or the local folder and a snapshot `.fountain` opens on the Mac (this also exercises the untested Java `dir` change). Also check single-file mode on the Boox.
