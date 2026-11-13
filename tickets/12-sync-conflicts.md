---
id: 12
title: Sync conflict detection and resolution
status: todo
blocked_by: [04, 11]
model: sonnet
---

# 12: Sync conflict detection and resolution

**Read first:** `SPEC.md` → stories 12–13 and the *Storage port* decision; tickets 04 and 11 Handoff notes.

## What to build

Never silently overwrite edits made on another device. Before saving, the app checks whether the file changed since it was last read or written. If it did, the writer sees both versions and chooses **Keep mine**, **Take theirs** or **Keep both**. When there are no unsaved local edits and the file changed elsewhere, the app quietly loads the new version.

## Decisions

- **The version is the content hash** (ticket 04). `DocumentSession` keeps `baseVersion` (the hash of the text last read from or written to the file).
- **Save with check** (used by autosave and manual save):
  1. `read(ref)` → `remoteText` and `remoteVersion`.
  2. If `remoteVersion === baseVersion`, write; `baseVersion` = the new version.
  3. If `remoteText` equals the local text (both devices made the same change), set `baseVersion` = `remoteVersion` and don't write.
  4. Otherwise it's a **conflict**: stop autosave for this document, keep journalling (ticket 04), and open the conflict screen.
- **Checking when the app returns to the foreground** (Capacitor `App` `resume`) and when the window regains focus:
  - read the file and compare its version
  - if it changed and there are **no unsaved local edits**, reload it, keep the cursor near the same line, and show "Updated from another device (hh:mm)"
  - if it changed **and** there are unsaved local edits, it's a conflict
- **Conflict screen** (a modal, one page at a time, never scrolling):
  - Header: "This script was changed somewhere else."
  - Two views: **Side by side** (left: "This device", right: "Other device", each paged in step) and **Changes** (reuses ticket 11's comparison view, with theirs as the starting point and mine as the changes). Toggle between them.
  - Before any choice is applied, take **two `pre-conflict` snapshots**: mine and theirs (ticket 11's SnapshotService). Nothing is ever lost.
  - **Keep mine:** write the local text over the file; `baseVersion` = the new version.
  - **Take theirs:** replace the editor's text with `remoteText` (one undoable transaction); `baseVersion` = `remoteVersion`.
  - **Keep both:** take theirs into this file, and save mine as a new file: `<name> (conflict <yyyy-mm-dd hh-mm>).fountain`. In workspace-folder mode, create it next to the original; in single-file mode, ask the writer where to save it (`pickCreate`). Then show both in recent files.
  - Esc or cancel: keep the conflict pending (autosave stays off); show a persistent banner "Unresolved conflict – [Resolve]".
- **Limitation (document in the README):** the app only sees what the Drive app has already synced to the device. If Drive hasn't synced yet, an edit from another device can't be detected. The snapshots taken before resolving are the safety net.

## Acceptance criteria

- [ ] `DocumentSession` tests with `MemoryStorage.simulateExternalEdit`:
  - an external edit + local edits → autosave detects the conflict and doesn't write
  - an external edit with no local edits → silently reloaded when the app returns to the foreground
  - identical text on both sides → no conflict
  - Keep mine / Take theirs / Keep both each give the correct file contents and `baseVersion`
  - pre-conflict snapshots exist for both sides before any resolution
  - cancelling keeps autosave off and keeps the banner state
  - after resolution, autosave resumes
- [ ] Keep both creates the expected file name in folder mode (tested) and calls `pickCreate` in single-file mode (tested with the fake).
- [ ] (manual, browser) Simulate a conflict with two tabs on the same File System Access handle, or with a debug command "simulate external edit".
- [ ] (device) Edit the same script on the Mac (in Beat or a text editor) while it's open on the Boox with unsaved edits. After Drive syncs and the app returns to the foreground, the conflict screen appears, and each choice behaves as described.

## Out of scope

Automatic three-way merging (a possible later ticket: the snapshots provide the common starting version), real-time collaboration.

## Handoff notes

_(Fill in: real-world Drive sync delays observed on the device.)_
