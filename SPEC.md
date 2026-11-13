# Spec: Boox Screenplay Writer — Phase 1 (Core)

Status: ready-for-agent

## Problem Statement

I want to write screenplays on my Boox Note Air 6C, a 10.3" colour e-ink Android tablet. I'd use a Bluetooth keyboard and sometimes the stylus. Existing screenplay apps are built for LCD screens. They scroll smoothly, animate, use colour to carry meaning, and redraw constantly, which on e-ink means ghosting, lag and a drained battery. Many also need an account or a subscription, don't sideload cleanly, or lock scripts into a format I can't open on my Mac (macOS) or iPhone (iOS).

I also want something most apps lack: a drawer of drop-in variables (key → value). The key goes in the script text, and the value replaces it in the printed version. I can then change a name, a place or a date in one spot and see the print view update immediately.

## Solution

A sideloadable Android app, tuned for e-ink, that edits screenplays stored as plain-text **Fountain** files. Because the files are Fountain, the same script can be opened on Mac and iPhone in existing Fountain editors, and synced through Google Drive.

Phase 1 delivers:

- A keyboard-first editor that formats screenplay elements automatically as you type.
- A **paged** print view that is always correct to industry pagination. You turn pages; nothing scrolls.
- A **Variable Drawer** whose values are stored inside the script file and resolved live in the print view and in exports.
- Export to PDF and Final Draft (FDX).
- A scene navigator, autocomplete, find and replace, inline notes, and a title page.
- Local autosave and snapshots, plus files opened through Android's file picker (which includes Google Drive). The app detects when a file was changed elsewhere and shows the two versions side by side.
- E-ink-specific behaviour: page-flip navigation, refresh control through the Onyx SDK, a high-contrast monochrome-first UI, and adjustable text size and theme.

The app is built as a TypeScript web core wrapped in a Capacitor Android shell, with a small native plugin for Onyx refresh control. The same core can later run as a browser app on Mac and iOS.

## User Stories

### Files & storage

1. As a writer, I want to create a new screenplay from a blank template, so that I can start writing immediately.
2. As a writer, I want my scripts saved as plain-text `.fountain` files, so that I can open them in any Fountain editor on my Mac or iPhone.
3. As a writer, I want to open a `.fountain` file from any location the Android file picker offers (local storage, Google Drive, etc.), so that I don't need a separate sign-in inside the app.
4. As a writer, I want a recent-files list, so that I can get back to the script I'm working on in one tap.
5. As a writer, I want my work autosaved a few seconds after I stop typing, so that I never lose text.
6. As a writer, I want unsaved edits recovered after a crash or a forced app kill, so that a battery death doesn't cost me a scene.
7. As a writer, I want to take a named snapshot of the current draft, so that I can experiment freely and go back.
8. As a writer, I want automatic snapshots at intervals and on file open, so that I keep a history without having to remember.
9. As a writer, I want to browse snapshots and restore one (the current version is kept as a new snapshot), so that restoring never destroys work.
10. As a writer, I want to compare a snapshot with the current draft (lines added and removed), so that I can see what changed between drafts.
11. As a writer, I want snapshots stored next to the script in a sidecar folder, so that they sync with it and aren't trapped on one device.
12. As a writer, I want the app to detect when the file was changed by another device since I opened it, so that I don't silently overwrite Mac edits.
13. As a writer, when a conflict is detected, I want to see both versions side by side and choose mine, theirs, or keep both as separate files, so that I can resolve it deliberately.
14. As a writer, I want to import an FDX file and have it converted to Fountain, so that I can bring in scripts from Final Draft.

### Editing & automatic formatting

15. As a writer, I want each line recognised as a screenplay element (scene heading, action, character, parenthetical, dialogue, transition, centered, lyric, section, synopsis, note, page break), so that formatting is automatic.
16. As a keyboard user, I want Tab and Enter to move between element types the way Final Draft does (e.g. Enter after a character cue → dialogue; Tab on an empty action line → character), so that I never reach for the mouse or screen.
17. As a keyboard user, I want a shortcut to force any element type on the current line, so that I can override the guess.
18. As a writer, I want scene headings, character cues and transitions shown in capitals automatically, so that I don't have to hold Shift.
19. As a writer, I want autocomplete for character names collected from the script, so that names stay consistent.
20. As a writer, I want autocomplete for scene-heading prefixes (INT., EXT., INT./EXT., I/E), locations already used, and times of day, so that headings are fast and consistent.
21. As a writer, I want (CONT'D) added automatically when the same character speaks again after only action in between, so that I don't track it by hand. This can be switched off.
22. As a writer, I want to mark dual dialogue, so that two characters speaking at once print side by side.
23. As a writer, I want inline notes (`[[ ]]`) that show in the editor but never print, so that I can leave reminders in place.
24. As a writer, I want to put text in the boneyard (`/* */`) so that cut material stays in the file but out of the printed script.
25. As a writer, I want sections (`#`) and synopses (`=`) that structure the script without printing, so that the navigator can show acts and sequences.
26. As a writer, I want undo and redo with full history for the session, so that I can edit fearlessly.
27. As a writer, I want find and replace, with options for case-sensitivity and whole-word matching, so that I can make sweeping edits.
28. As a writer, I want spell-check that learns character names, locations and variable keys from the script, so that proper nouns aren't flagged.
29. As a writer, I want a title page editor (title, credit, author, source, draft date, contact), so that exports include a proper cover.

### Variable Drawer

30. As a writer, I want a drawer listing key:value pairs, so that I can manage drop-in variables in one place.
31. As a writer, I want to type `{{KEY}}` in the script to insert a variable, with autocomplete from the drawer, so that variables are quick to use.
32. As a writer, I want to add, rename, edit and delete variables in the drawer, so that I can change values at any time.
33. As a writer, I want renaming a key to update every place it's used, so that references never break.
34. As a writer, I want the print view to update immediately when I change a value, so that I can see the result right away.
35. As a writer, I want variables stored in a metadata block inside the `.fountain` file, so that they travel with the script across devices.
36. As a writer, I want keys with no value highlighted in the editor and listed as warnings before export, so that I never print `{{HERO}}` by accident.
37. As a writer, I want a variable used as a character cue to be uppercased in the print view and still counted as that character (autocomplete, reports), so that variables work as character names.
38. As a writer, I want the drawer to show how many times each key is used, and to jump to each place it's used, so that I can see the impact before changing a value.
39. As a writer, I want a way to write a literal `{{` that isn't treated as a variable, so that I can use braces in text if needed.
40. As a writer, I want to choose at export time whether variables are resolved or kept as `{{KEY}}`, so that I can share a working copy with someone who has the drawer.

### Paged print view & pagination

41. As a writer, I want a print view showing the script exactly as it will print (US Letter, Courier Prime 12pt, industry margins), so that what I see is what I submit.
42. As a writer, I want correct page breaks: (MORE)/(CONT'D) on split dialogue, no scene heading left alone at the bottom of a page, no lone parenthetical, and dialogue split only between sentences, so that the page count is accurate.
43. As a writer, I want the page count and an estimated running time, so that I can track length (about one minute per page).
44. As a writer, I want optional scene numbers on both margins, so that the script is production-ready when needed.
45. As a writer, I want to switch between the editor and the print view, and on a large screen see them side by side, so that I can write while seeing the final layout.
46. As a writer, I want A4 as an option, so that I can produce scripts for markets that use A4.

### Navigation

47. As an e-ink user, I want to move through the script one page at a time (tap zones, volume keys, PgUp/PgDn) instead of smooth scrolling, so that the screen doesn't ghost or lag.
48. As a writer, I want a scene navigator listing every scene heading with its scene number and page, with sections and synopses shown, so that I can see the structure.
49. As a writer, I want to tap a scene in the navigator to jump to it, so that moving through a long script is instant.
50. As a writer, I want to jump to a page number, so that I can follow notes like "p.42".
51. As a writer, I want to filter the navigator by character, so that I can find every scene a character appears in.

### Export

52. As a writer, I want to export a PDF that matches the print view exactly, including the title page, so that I can submit or share it.
53. As a writer, I want an optional watermark text on the PDF, so that I can mark drafts as confidential.
54. As a writer, I want to export FDX, so that collaborators using Final Draft can open my script.
55. As a writer, I want to export Fountain with variables resolved, so that a clean copy can go to another Fountain user.
56. As a writer, I want exports saved through the Android file picker or the share sheet (e.g. to Drive or email), so that I can send them where I need.

### E-ink & device

57. As an e-ink user, I want the app to switch to fast refresh while I type and do a full clean refresh when I pause or turn the page, so that typing is responsive and ghosting clears.
58. As an e-ink user, I want no animations, transitions or spinners, so that the screen redraws only when something meaningful changes.
59. As an e-ink user, I want a high-contrast, monochrome-first UI where colour is never the only signal, so that it reads well on the Kaleido 3 screen.
60. As a writer, I want adjustable editor text size and line spacing that don't affect the printed layout, so that I can write comfortably.
61. As a writer, I want light and dark (inverted) themes, so that I can pick what reads best in different light.
62. As a keyboard user, I want the on-screen keyboard suppressed when a Bluetooth keyboard is connected, so that it doesn't cover half the page.
63. As a keyboard user, I want shortcuts for every common action (save, snapshot, navigator, drawer, print view, export, find), so that I can work without touching the screen.
64. As a writer, I want the app to work fully offline, so that I can write anywhere.
65. As a writer, I want a distraction-free mode that hides everything except the current page, so that I can focus.

### Reports (lightweight)

66. As a writer, I want a character report (number of lines, words of dialogue, scenes appeared in), so that I can check balance between characters.
67. As a writer, I want a location report (scenes per location, interior/exterior, day/night), so that I can see the shape of the script.

## Implementation Decisions

- **Platform:** a TypeScript web application packaged with Capacitor into a sideloadable Android APK (target Android 13, as on the Note Air 6C). Signing is a local release keystore; no Play Store.
- **Canonical file format:** Fountain (plain text, UTF-8). The app never stores scripts in a proprietary format. App-specific data that must travel with the script (variables, and later revision metadata) goes in the Fountain title-page key/value block using app-namespaced keys, so other Fountain editors ignore it safely.
- **Variable syntax:** `{{KEY}}`. Keys are uppercase letters, digits and underscores. A literal is written `\{{`. Variables live in the title-page metadata block, one entry per key, under a namespaced key. Variables are resolved **after** parsing to elements and **before** pagination, so resolved values affect line wrapping and page breaks.
- **Modules:**
  - **Script Engine** (pure, no I/O, no DOM). It has one deep interface. In practice the operations are:
    - `parse(text) → ScriptDocument` (an ordered list of typed elements, the title page and variables)
    - `resolve(doc, variables, options) → ResolvedDocument`
    - `paginate(resolved, pageSpec) → PagedScript` (pages → positioned lines, with (MORE)/(CONT'D), scene numbers, page count)
    - `exportPdf(paged, options) → bytes`
    - `exportFdx(resolved) → string`
    - `importFdx(string) → text`
    - `report(doc) → character and location stats`
    - `diff(textA, textB) → line hunks`

    Everything else depends on this module, and it has no dependencies of its own.
  - **Editor**: a text-editing surface working on raw Fountain text, with element-aware behaviour (Tab/Enter cycling, auto-caps, autocomplete) driven by the Script Engine's line classifier. CodeMirror 6 is the recommended base, with all animations disabled.
  - **Print View**: renders a `PagedScript`, one page at a time. It only reads the engine's output and never re-implements layout.
  - **Variable Drawer**: UI over the document's variables. Edits write back into the metadata block and trigger re-resolve and re-paginate (debounced, done off the main thread if it's slow).
  - **Storage port**: `open(uri)`, `save(uri, text, expectedVersion)`, `stat(uri)`, `listSnapshots`, `writeSnapshot`, `readSnapshot`. Implementations: Android file access through the system file picker (which covers Drive through the Drive app) and an in-memory fake. Saving compares the file's modified time or version against the one recorded at open; a mismatch returns a conflict result and nothing is written.
  - **Snapshots**: stored in a sidecar folder next to the script, as plain `.fountain` copies with ISO-timestamp names and an optional label. Each automatic snapshot is taken only if the text changed. Old automatic snapshots are pruned (keep all named ones, plus a time-thinned set of automatic ones).
  - **E-ink plugin** (native Capacitor plugin, Kotlin): exposes `setRefreshMode(fast|normal|full)` and `fullRefresh()` using the Onyx EPD SDK. Without Onyx hardware, every call does nothing, so the app runs on any Android device or in a browser.
- **Pagination spec:** US Letter by default (A4 optional), Courier Prime 12pt, 6 lines per inch, 54–55 lines of body per page, with standard element indents (action 1.5" left margin; dialogue 2.5"; parenthetical 3.1"; character 3.7"; transition right-aligned). The rules for page breaks around (MORE) and (CONT'D) follow common industry practice. They will be written down as engine test cases (golden files) as decisions are made.
- **PDF generation:** the PDF is drawn from the same `PagedScript` the Print View shows, using an embedded Courier Prime font, so the PDF and the screen can't differ.
- **Theme and text size** affect only the Editor; the Print View and exports always use the fixed print specification.
- **No backend.** No accounts, no server, no analytics.

## Testing Decisions

- **Good tests check external behaviour through the seam:** given input text (and variables or options), assert on the resulting document, page layout or export. No tests of internal helpers, parser state or component internals. Tests shouldn't break when the code is restructured internally.
- **Seam 1 — Script Engine** (most of the tests):
  - Parsing: Fountain samples → expected element types, covering every element, forced elements, the boneyard, notes, dual dialogue and the title page.
  - Variables: resolution, keys with no value, escaping, renames, cue uppercasing.
  - Pagination: golden tests. A Fountain fixture produces a page and line layout, which is compared with a checked-in expected snapshot. Includes cases for (MORE)/(CONT'D), orphaned headings, sentence-boundary splits and page counts for known scripts.
  - Export: the PDF's text content and page count (not pixels); FDX that is well-formed and round-trips through `importFdx`.
  - `diff` and `report` outputs on fixtures.
- **Seam 2 — Storage port** with the in-memory fake: autosave, crash recovery, snapshot create/restore/prune, conflict detection when the version changes between open and save, and the three ways to resolve a conflict (mine, theirs, keep both).
- **Not automated:** the Editor UI feel, the e-ink refresh behaviour and Bluetooth keyboard handling are checked by hand on the Note Air 6C against a short checklist.
- **Prior art:** none in this repo (it's new). Use the public Fountain spec's sample scripts as parsing and pagination fixtures. Use Vitest as the test runner.

## Out of Scope

These are deferred to later phases; the design must not block them:

- **Phase 2 (Organise):** a corkboard of index cards and a beat board, an outline editor kept in sync with the script, character bios, colour-coded storylines.
- **Phase 3 (Revisions):** revision mode with the standard colour order (White → Blue → Pink → Yellow → Green → Goldenrod → Buff → Salmon → Cherry), page locking, A-pages and A-scenes, OMITTED placeholders, revision asterisks, alternate dialogue lines that can be swapped.
- **Phase 4 (Stylus & production):** handwritten margin notes and pen gestures, breakdown tagging (props, cast, wardrobe, etc.) and production reports.
- **Not planned:** real-time multi-writer collaboration; scheduling, budgeting and call sheets; templates for stage plays, AV scripts, comics or games; storyboarding; any server component; Google Drive API sign-in (the system file picker is used instead); native iOS or macOS apps (existing Fountain editors are used there).

## Further Notes

- **Biggest risk:** pagination accuracy. Build the Script Engine and its golden tests first, before the UI.
- **Second risk:** typing latency in an Android WebView on e-ink. Spike it early on the device: a CodeMirror editor plus fast refresh, measuring keystroke-to-visible latency. If it's unacceptable, fall back to a native text editing surface while keeping the TypeScript Script Engine. The engine would then run in an embedded JS runtime or be ported to Kotlin, which is costly; the spike decides this.
- **Later decisions** are recorded in `PLAN.md` → *Decision log*: D1 (workspace folder or single file), D2 (the file version is a hash of its contents), D3 (libraries and how variables are stored).
- **File picker access to Drive:** opening a Drive file through the system picker requires the Google Drive app on the Boox, which needs Google Play enabled in the Boox settings. If Drive files can't be written back reliably, a fallback is a local folder synced by a third-party sync app.
- **Cross-device use:** on Mac and iPhone, Beat (Mac) and other Fountain apps can edit the same file. They will ignore the app's namespaced metadata keys but should preserve them. Verify that each target editor actually keeps unknown title-page keys.
