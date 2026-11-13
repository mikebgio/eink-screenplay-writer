---
id: 04
title: Open, save, autosave and recovery
status: needs-device
blocked_by: [01]
model: sonnet
---

# 04: Open, save, autosave and recovery

**Read first:** `SPEC.md` → stories 1–6, *Implementation Decisions* (Storage port), *Further Notes* (file picker access to Drive); `PLAN.md` → *Decision log* D1; ticket 01 Handoff notes.

## What to build

Real files. The writer can create a new script from a template, open `.fountain` files from the device or from Google Drive, and see recent files. Edits autosave, and are recovered if the app is killed. All of this goes through a **Storage port** with an in-memory fake, so the behaviour is tested without a device (seam 2 in the spec).

## Decisions

- **Storage port interface** (in `src/storage/`, with no Capacitor imports in the interface itself):

  ```ts
  interface FileRef { uri: string; name: string; folderUri?: string }
  interface Stat { version: string } // a content hash (see below)
  interface StoragePort {
    pickOpen(): Promise<FileRef | null>;
    pickCreate(suggestedName: string): Promise<FileRef | null>;
    pickFolder(): Promise<{ uri: string } | null>;          // workspace folder
    listFolder(folderUri: string): Promise<FileRef[]>;
    read(ref: FileRef): Promise<{ text: string; version: string }>;
    write(ref: FileRef, text: string): Promise<{ version: string }>;
    // sidecar files (snapshots, ticket 11) — only when folderUri is known:
    sidecar(ref: FileRef): SidecarStore | null;
  }
  ```

- **The version is a SHA-256 of the file contents**, not its modified time. Storage backends like Drive don't report modified times reliably, and a hash makes conflict detection (ticket 12) independent of the provider. Use `crypto.subtle`.
- **Two ways to access files** (see Decision log D1):
  1. *Workspace folder* (preferred). The writer picks a folder once, using Android's folder picker; the app keeps permanent access to it; files are listed inside it, and sidecar folders for snapshots are possible.
  2. *Single file*. Open a file with the file picker; access is kept for that one file only; no sidecar (snapshots fall back to app-private storage in ticket 11).

  **You must check on the device whether the Google Drive app allows folder access.** If it doesn't, Drive files use mode 2. Record the result in Handoff notes.
- **Android implementation:** a small local Kotlin plugin, `DocumentStore`, using the Android file-picker intents for opening, creating and choosing a folder, keeping permanent access to what the writer picked, and reading and writing through Android's `ContentResolver`. Write with mode `"wt"` (truncate). Keep the plugin thin: no business logic.
- **Browser fallback** (for `npm run dev`): use the File System Access API where available, otherwise a localStorage-backed fake folder.
- **Autosave** happens 2 s after the last keystroke, and also when the app goes to the background (Capacitor `App` `pause` event). Show a small text indicator: "Saved", "Saving…" or "Unsaved". No spinner.
- **Crash recovery journal:** every 1 s while there are unsaved changes, write the buffer to app-private storage (Capacitor Filesystem, `Directory.Data`) under a key derived from the file URI. Clear the journal after a successful save. When a file is opened and a journal exists whose text differs from the file, offer: "Recover unsaved changes from <time>?" with the choices [Recover] [Discard].
- **Recent files:** the last 10 file references, with their names, stored in Capacitor Preferences and shown on the start screen.
- **New script template:** a title page (Title, Credit, Author, Draft date = today) plus `FADE IN:` and an empty scene heading.
- Conflict detection is **not** part of this ticket. Keep the version returned by `read`, and store the last known version per open file so ticket 12 can use it.

## Steps

1. Define the port, and build `MemoryStorage` (the fake) with helpers to simulate another device editing a file (`simulateExternalEdit(uri, text)`).
2. Build a `DocumentSession` service: open → keep the text and version → edits → autosave → journal. **Test it only through the fake**, with Vitest fake timers.
3. Build the Android plugin and the browser fallback.
4. UI: a start screen with [New script] [Open file] [Choose workspace folder], the recent files list, and the workspace file list. Show the open document's name in a header bar.

## Acceptance criteria

- [x] `DocumentSession` tests run against `MemoryStorage`:
  - autosave fires 2 s after the last edit, and not before
  - going to the background saves immediately
  - the journal is written while there are unsaved changes and cleared after saving
  - reopening after a simulated crash offers recovery
  - recovering restores the text; discarding removes the journal
- [x] The recent files list stays in order, has no duplicates and is capped at 10 (tested).
- [x] A new script from the template parses with a title page and a scene heading.
- [ ] `npm run dev` can open, edit and save a local `.fountain` file in Chrome.
- [ ] (device) Open, edit and autosave work for a file in local storage on the Boox.
- [ ] (device) Open, edit and autosave work for a file in Google Drive (needs the Drive app; Google Play must be enabled in the Boox settings). The edit appears on the Mac within a minute.
- [ ] (device) Whether Drive supports folder access is recorded in Handoff notes.

## Out of scope

Snapshots (11), conflicts (12), export (09/10).

## Handoff notes

- **Drive folder access: not yet checked.** Needs the Boox. Open "Choose workspace folder" and see whether Google Drive is offered in the folder picker; if not, Drive files use single-file mode (`pickOpen`). Record the result here.
- **Not verified:** "`npm run dev` can open, edit and save in Chrome". The start screen loads without console errors, but the file pickers need a human click. The Kotlin plugin (`DocumentStorePlugin.java`) has not been compiled or run; `npm run apk` is still to do.
- **Template and parser:** the template test now asserts the parsed title page (ticket 03 landed).
- **Replacing the document:** `Editor` now takes `text` + `revision`. Bump `revision` to swap in a new document (it resets undo history); typing stays uncontrolled.
- **Ports and files:** `src/storage/` holds the port, `MemoryStorage`, `DocumentSession`, `JournalStore`, `RecentFiles` and the template (no Capacitor imports). `src/platform/` holds `NativeStorage`, the browser fallbacks (File System Access API, else a localStorage fake folder), the journal on Capacitor Filesystem, and Preferences. The `App` `pause` event is wired through `onBackground`.
- **For ticket 12:** `DocumentSession.version` is the last version read or written. **For ticket 11:** `storage.sidecar(ref)` returns a store only when `ref.folderUri` is set. Workspace listing sets it; single-file opens don't. The Android sidecar folder is `.scriptwriter` inside the picked folder. The browser File System Access backend returns `null` for sidecars.
- **Added dependencies:** `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/preferences`, and `androidx.documentfile` on Android. Run `npm run android` (cap sync) before building the APK.
- **Autosave edge cases:** an edit made while a write is in flight keeps the journal and schedules another save.
