---
id: 12
title: Sync conflict detection and resolution
status: needs-device
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

- [x] `DocumentSession` tests with `MemoryStorage.simulateExternalEdit`:
  - an external edit + local edits → autosave detects the conflict and doesn't write
  - an external edit with no local edits → silently reloaded when the app returns to the foreground
  - identical text on both sides → no conflict
  - Keep mine / Take theirs / Keep both each give the correct file contents and `baseVersion`
  - pre-conflict snapshots exist for both sides before any resolution
  - cancelling keeps autosave off and keeps the banner state
  - after resolution, autosave resumes
- [x] Keep both creates the expected file name in folder mode (tested) and calls `pickCreate` in single-file mode (tested with the fake).
- [ ] (manual, browser) Simulate a conflict with two tabs on the same File System Access handle, or with a debug command "simulate external edit".
- [ ] (device) Edit the same script on the Mac (in Beat or a text editor) while it's open on the Boox with unsaved edits. After Drive syncs and the app returns to the foreground, the conflict screen appears, and each choice behaves as described.

## Out of scope

Automatic three-way merging (a possible later ticket: the snapshots provide the common starting version), real-time collaboration.

## Handoff notes

- **Real-world Drive sync delays: not yet observed.** Needs the Boox (see Owner checks).
- **Session API** (`src/storage/session.ts`): `version` is now `baseVersion`. New: `conflict` (`{ theirs, theirsVersion }`; "mine" is always the live `text`), `onForeground()`, `resolveConflict('mine' | 'theirs' | 'both', seenVersion)` → `resolved` / `changed` (may carry the "Keep both" `copy`) / `cancelled`, and `close()` (call it when leaving a document; with a pending conflict it snapshots the local text first and rejects if it can't). `seenVersion` is the `theirsVersion` that was on screen. New options: `snapshots` (required), `onConflict`, and `onReplace(text, 'reload' | 'theirs' | 'both')`, called synchronously when the session changes the text itself. Saves, checks and resolutions are queued, so a check never mistakes its own in-flight write for an outside edit.
- **Resolving never applies over an unseen version:** the file is re-read after the snapshots (and again after the "Keep both" save picker). If it changed, nothing in the original is written, the screen shows the new version and the result is `changed`.
- **Pre-conflict snapshots** use `SnapshotService.takeSafetyCopy(text)`, not `take(text, 'pre-conflict')`: `take` skips text equal to the previous snapshot, which may be a prunable auto one. A retried resolution can therefore leave repeated pre-conflict snapshots. If a snapshot can't be written, nothing is applied.
- **Crash recovery:** journal entries now store `baseVersion`. Recovering edits made against an older file version opens the conflict screen instead of overwriting the file. This is also how a cancelled conflict survives leaving the script (Files) or an app kill: reopen, choose Recover. Journals written by v0.1.0 have no `baseVersion` and recover as before.
- **Editor:** a silent reload stays out of the undo history (undo never reverts the other device's edits); "Take theirs" and "Keep both" are one undo step (`src/ui/replaceDoc.ts`). Both keep the cursor near its line. A silent reload first takes a `pre-conflict` snapshot of the text it replaces, and doesn't reload if that fails, so these snapshots (never pruned) grow with each outside change. The replacement is one change per run of changed lines, so undo history survives; for that, `diff` now splits very large changed regions at unique lines before falling back to one remove + add.
- **Line endings:** the same text with CRLF and LF is not a conflict. The file keeps its CRLF until the next edit, which saves LF.
- **Title page form:** it can stay open across a reload; Save writes only the fields edited in the form (`rebaseTitleValues`).
- **Not covered:** if the app is killed while a conflict is pending, the journal is the only copy of the local text until the writer answers the recovery offer.
- **Storage port:** new `createInFolder(folderUri, name)`, implemented by all backends. `DocumentStorePlugin.java` creates the file as `application/octet-stream` so Android doesn't append an extension. This Java method has not been compiled or run locally.
- **Snapshot file names (device-unverified):** `sidecarWrite` now also creates files as `application/octet-stream`. As `text/plain`, Android's local storage provider may have named them `….fountain.txt`, which the app doesn't list; any already named that way stay hidden. Single-file "Keep both" and New script still use the picker with `text/plain`.
- **Remaining gap:** the file can still change in the instant between the re-read and the write. And the app only sees what the Drive app has synced (see the README).
- **Verified in the Claude browser pane** with the localStorage fake folder (outside edits made by changing its entry, then a `focus` event): silent reload and message, conflict on autosave, both views fitting at 930×1240, Esc and banner, Ctrl+S reopening, Keep both, and undo. Not run with File System Access handles or two tabs.

**Owner checks:**
- (manual, browser) Simulate a conflict with two tabs on the same File System Access handle in real Chrome.
- (device) Edit the same script on the Mac while it's open on the Boox with unsaved edits. After Drive syncs and the app returns to the foreground, the conflict screen appears, and each choice behaves as described. Record the sync delay above.
- (device) In workspace-folder mode, "Keep both" creates `<name> (conflict …).fountain` (no `.txt` added), and the `pre-conflict` snapshots appear in the Snapshots panel.
- (Chrome) In single-file "Keep both", pick the original in the save picker: the app refuses and the original still has its content.
