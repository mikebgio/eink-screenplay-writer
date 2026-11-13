---
id: 01
title: Minimal working app on the tablet
status: in-progress
blocked_by: []
model: sonnet
---

# 01: Minimal working app on the tablet

**Read first:** `SPEC.md` (whole file), `PLAN.md` → *Agent rules*.

## What to build

The thinnest end-to-end path through every layer. Opening the app on the Boox shows an editor holding a short Fountain script. Next to it, page 1 of the print view is drawn in Courier Prime. Editing the text updates the page. Every later ticket builds on this project setup, folder layout and test harness, so get the foundations right rather than the features.

## Decisions (already made — do not revisit)

- **Stack:** Vite + TypeScript (strict) + Preact for UI + CodeMirror 6 for the editor + Capacitor (latest stable major) for Android. Vitest for tests. ESLint + Prettier.
- **Package manager:** npm.
- **Folder layout** (module boundaries matter; exact file names inside them are up to you):
  - `src/engine/`: the **Script Engine**. Pure TypeScript: no DOM, no Capacitor, no I/O, no imports from outside `src/engine/`. Enforce this with a separate `tsconfig` for the engine whose `lib` excludes `DOM`, plus an ESLint `no-restricted-imports` rule.
  - `src/storage/`: the Storage port (ticket 04).
  - `src/platform/`: thin wrappers around Capacitor and native plugins. Each wrapper has a browser fallback, so the app runs with `npm run dev` in a desktop browser.
  - `src/ui/`: Preact components (editor, print view, drawers, dialogs).
  - `test/fixtures/` for `.fountain` inputs, and `test/golden/` for expected outputs.
  - `assets/fonts/`: Courier Prime (Regular, Bold, Italic, Bold Italic). It is under the SIL Open Font License; download it from the official Courier Prime release on GitHub or Google Fonts, and commit the TTFs with the licence file.
- **npm scripts:** `dev`, `build`, `test`, `typecheck`, `lint`, `android` (= build + `cap sync android`), `apk` (= assemble a debug APK).
- **Android:** app id `dev.personal.boox.screenplay`, app name "Scriptwriter". Debug-signed APK is fine for sideloading. Document how to build it in `README.md`.
- The default document shown on first launch is a hard-coded sample Fountain string (about 20 lines: a scene heading, action, a character with dialogue). Real file opening comes in ticket 04.

## Steps

1. The repo already exists (branch `main`), and the planning docs are its first commit. Don't run `git init`. Add `.gitignore` (node_modules, dist, android build outputs, `.idea`, local keystores).
2. Scaffold Vite + Preact + TS. Add Vitest, ESLint and Prettier. Add the engine-purity rule.
3. **Script Engine (minimal):** `parse(text)` recognises only *scene heading* (lines starting `INT.`/`EXT.`/`EST.`/`INT./EXT.`/`I/E`, or forced with a leading `.`), *character* (an all-caps line preceded by a blank line and followed by a non-blank line), *dialogue* (the lines after a character) and *action* (everything else). Each element keeps its source line range. Ticket 03 replaces this with the full parser, so keep the function signature `parse(text: string): ScriptDocument`.
4. **Engine (minimal pagination):** `paginate(doc)` returns pages of positioned lines, wrapping text by character count (Courier is monospaced, 10 characters per inch). Action is 60 characters wide; dialogue is 35 characters wide at 2.5" from the left edge; the character cue is at 3.7". Put one blank line between elements, 54 body lines per page. No special page-break rules yet (that's ticket 06).
5. **Print View:** renders a single page as a `div` sized 8.5in × 11in in Courier Prime 12pt, scaled with a CSS `transform` to fit the available width. Lines are absolutely positioned using the engine's coordinates. The print view must not compute any layout itself.
6. **Editor:** CodeMirror 6 with no line wrapping animation, `cursorBlinkRate: 0` (blinking forces e-ink redraws), and no transitions. On change, debounce 150 ms, then call `parse` → `paginate` → re-render the print view.
7. Layout: editor on the left and print view on the right, stacked vertically if the screen is narrower than 900 px.
8. `npx cap add android`, build, and confirm a debug APK is produced.
9. `README.md`: prerequisites (Node LTS, JDK 21, Android SDK/command-line tools, `ANDROID_HOME`), the build command, and how to sideload (`adb install -r …apk`, or copy the APK to the Boox over USB or Drive and open it there).

## Acceptance criteria

- [x] `npm test`, `npm run typecheck` and `npm run lint` pass. The engine-purity lint rule fails if a DOM or Capacitor import is added inside `src/engine/` (prove this once, then remove the import).
- [x] At least 6 Vitest tests through the engine's public interface: parse classifies each of the 4 element types; paginate wraps a long action line at 60 characters and long dialogue at 35; a 200-line script produces more than one page.
- [x] `npm run dev` shows the editor and print view in a desktop browser; typing updates the page within about 200 ms.
- [x] Print view text is Courier Prime (loaded from the bundled font, never fetched from a network).
- [ ] `npm run apk` produces a debug APK. If the Android SDK or JDK isn't installed on this machine, stop at this step and write the exact install commands for the owner in the ticket's Handoff notes. Don't install system tools without asking.
- [ ] (device) The APK installs and launches on the Note Air 6C and shows the sample script.
- [x] `README.md` documents building and sideloading.

## Out of scope

Real file I/O, other element types, page-break rules, theming, e-ink refresh control.

## Handoff notes

**Status note:** `npm run apk` could NOT run here (no JDK, no Android SDK, no adb). The Android project is scaffolded (`android/`, app id `dev.personal.boox.screenplay`, name "Scriptwriter") and `cap sync` works. So the `npm run apk` criterion stays unticked and the status stays `in-progress` until the owner builds it. The `npm run dev` check was verified afterwards from the main session (editor + print view render, Courier Prime loaded, edit reaches the print view in 161 ms); `npm run build` succeeds and bundles all four Courier Prime TTFs into `dist/assets` (no network fetch). Debounce is 150 ms.

**Owner install steps (macOS):** follow `docs/android-dev-setup-macos.md` §6 (recommended path).
- Install JDK 21 (Temurin) and Google's command-line tools from Homebrew.
- Set `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`.
- Use `sdkmanager` to install `platform-tools`, `platforms;android-36` and `build-tools;35.0.0`.
- Run `npm run apk`.

The project needs Android Gradle Plugin 8.13.0, Gradle 8.14.3 (downloaded by the wrapper), compile/target SDK 36 and minimum SDK 24, and JDK 21, because Capacitor 8 compiles with Java 21. Then tick the `npm run apk` criterion (APK at `android/app/build/outputs/apk/debug/app-debug.apk`).

**Owner checks:** (device) APK installs and shows the sample script on the Note Air 6C; engine-purity proof was done once (a `@capacitor/core` import in `src/engine/` failed ESLint, a `document` reference failed `tsconfig.engine.json`; then removed).

**Engine API (for tickets 02-15), all from `src/engine/index.ts`:**
- `parse(text: string): ScriptDocument` where `ScriptDocument = { elements: ScriptElement[] }`, `ScriptElement = { type: ElementType; text: string; startLine: number; endLine: number }` (0-based, inclusive; multi-line text joined with `\n`). `ElementType = 'scene-heading' | 'action' | 'character' | 'dialogue'`. A forced `.` heading has the dot stripped from `text`. A scene heading followed directly by non-blank lines yields heading + action.
- `paginate(doc: ScriptDocument): PagedScript` = `{ pages: Page[]; pageCount; width: 8.5; height: 11 }`; `Page = { number (1-based); lines: PositionedLine[] }`; `PositionedLine = { text; x; y (inches from top-left of paper); type; elementIndex }`. Constants exported from `paginate.ts`: `BODY_LINES_PER_PAGE=54`, `TOP_MARGIN_IN=1`, `LINES_PER_INCH=6`. Layout: scene heading/action x=1.5 width 60; dialogue x=2.5 width 35; character x=3.7. Also exported: `wrap(text, width)`. No `PageSpec` parameter yet (ticket 05/06 should add one).
- Scene headings and character cues are NOT yet uppercased in output; no page numbers drawn; a blank row at page top is dropped.

**Folder layout:** `src/engine/{types,parse,paginate,index}.ts`; `src/ui/{App,Editor,PrintView}.tsx`, `styles.css`, `sample.ts` (SAMPLE_SCRIPT); `src/platform/index.ts` (`isNative()`); `src/storage/` empty (`.gitkeep`); `src/main.tsx`; tests in `test/engine.test.ts` (10 tests, node env, `test/**/*.test.ts`); fixture `test/fixtures/sample.fountain`; `test/golden/` empty.

**Quirks:**
- `npm run typecheck` runs both `tsconfig.json` (DOM) and `tsconfig.engine.json` (no DOM, `types: []`).
- Versions installed: Preact 11, Vite 8, Vitest 5, TypeScript 6, ESLint 10, Capacitor 8.
- `~/.npm` cache is root-owned on this machine; use `npm_config_cache=<tmpdir>` or `sudo chown -R 501:20 ~/.npm`.
- PrintView shows only page 1 (`pageIndex={0}`); page turning is ticket 05. `vite.config.ts` uses `base: './'` and `assetsInlineLimit: 0` so fonts are separate files.
- Editor is uncontrolled: `initial` only used at mount (`Editor.tsx`); ticket 04 must add a way to replace the document.
