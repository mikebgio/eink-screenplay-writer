---
id: 02
title: Typing-speed test and screen refresh control
status: needs-device
blocked_by: [01]
model: sonnet
---

# 02: Typing-speed test and screen refresh control

**Read first:** `SPEC.md` → *Implementation Decisions* (E-ink plugin) and *Further Notes* (second risk); `PLAN.md` → *Agent rules*; ticket 01 Handoff notes.

## What to build

1. A native Capacitor plugin, **EInk**, that controls how the Boox redraws the screen.
2. Wiring so the app switches to fast refresh while you type and does a full clean refresh after a pause.
3. A **typing-speed test** that measures how long a keypress takes to appear, so the owner can decide whether the WebView + CodeMirror approach is good enough. **This ticket is a go/no-go gate for the whole architecture.**

## Decisions

- Write the plugin in Kotlin as a *local* plugin inside the Android project; it doesn't need to be a separate npm package. Its JS wrapper lives in `src/platform/`.
- Plugin API (TypeScript side):
  - `setRefreshMode(mode: 'fast' | 'normal' | 'full'): Promise<void>`
  - `fullRefresh(): Promise<void>` (one clean redraw of the screen, to clear ghosting)
  - `isEInk(): Promise<{ value: boolean }>`
- When the device isn't a Boox (`Build.MANUFACTURER` is not "ONYX", compared case-insensitively) or the app is running in a browser, every call does nothing and `isEInk` returns false.
- Onyx SDK: add the Onyx Maven repository (`https://repo.boox.com/repository/maven-public/`) and the `onyxsdk-device` artifact. **The API names below are from memory and must be verified** against Onyx's official sample repository (`onyx-intl/OnyxAndroidDemo` on GitHub) before use:
  - fast ≈ `UpdateMode.ANIMATION` / `A2` / `DU`, normal ≈ `UpdateMode.GU`/`REGAL`, full ≈ `UpdateMode.GC`
  - `EpdController.setViewDefaultUpdateMode(webView, mode)`, `EpdController.resetViewUpdateMode(webView)`, `EpdController.invalidate(webView, UpdateMode.GC)`
  - If the SDK dependency can't be resolved or the API differs, record what you found in Handoff notes and implement against the real API.
- Refresh policy (in `src/platform/`, not in the UI components): on the first keystroke switch to `fast`. Call `fullRefresh()` and return to `normal` after 1500 ms with no keystrokes, and also on every page turn or when a dialog or drawer opens or closes.
- Remove anything that animates across the app: CSS transitions, animations, smooth scroll, blinking cursor. Add a global CSS rule `*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }`.

## Typing-speed test

- Add a hidden debug screen (opened from a long-press on the app title, or `Ctrl+Shift+D`) that:
  - for each key press, records `performance.now()` at `keydown` and again at the next `requestAnimationFrame` after CodeMirror has updated
  - shows the median and 95th-percentile delay for the last 200 keys, with fast mode on and with it off
  - has a "Type test" mode with a sample paragraph to copy-type
- These numbers measure only the browser side. Also write `docs/latency-test.md`: instructions for the owner to film typing on the Boox with a phone in slow motion (240 fps), count frames from key press to glyph appearing, and record the results.
- Decision rule, recorded in `docs/decisions/0001-editor-surface.md`: **GO** if the median keypress-to-glyph delay in fast mode is under about 150 ms and typing feels fluid; otherwise **NO-GO**, and list the fallbacks: a native `EditText` editor with the engine run in an embedded JS runtime, or a Kotlin port of the engine. The owner fills in the result; you write the template with the browser-side numbers.

## Acceptance criteria

- [ ] The plugin builds; on a non-Onyx emulator every method resolves and does nothing (prove it with a Vitest test of the browser fallback and a manual emulator run).
- [x] The refresh policy is unit-tested with fake timers and a fake plugin: keystroke → fast; 1500 ms idle → fullRefresh + normal; page-turn event → fullRefresh.
- [x] The global no-animation CSS is in place; searching the codebase finds no `transition`/`animation` declarations outside that reset.
- [ ] The debug latency screen works in a desktop browser.
- [x] `docs/latency-test.md` and the `docs/decisions/0001-editor-surface.md` template exist.
- [ ] (device) Fast mode visibly reduces typing lag on the Note Air 6C; ghosting clears after the 1.5 s pause.
- [ ] (device) The owner records GO/NO-GO in the decision record. **If NO-GO, set this ticket to `needs-device`, write a summary at the top of `PLAN.md`, and stop. Later UI tickets must be re-planned.**

## Notes

- The Boox system also offers per-app refresh settings in its own app-optimisation menu. Mention them in the README as a manual fallback, but don't depend on them.
- Volume-key page turning is handled in ticket 15, which reuses this plugin. Leave a clear place in the plugin to add key-event forwarding.

## Handoff notes

**Status:** code complete; `needs-device`. Gradle/JDK/adb are not installed on the dev Mac, so the Kotlin plugin was **never compiled** and the "plugin builds" criterion is unticked. `npm test` (197), `npm run typecheck`, `npm run lint` and `npm run build` pass.

**Onyx API, as verified.** Checked against `onyx-intl/OnyxAndroidDemo` (README, `doc/EPD-Screen-Update.md`, `doc/EPD-Update-Mode.md`, `doc/EpdController.md`) via web fetch. Not verified: the demo's Java sources (not retrievable) and anything on the Boox Maven server.
- SDK: `com.onyx.android.sdk:onyxsdk-device:1.1.11` (the version the demo README gives; newer may exist). Repo: the demo README lists `http://repo.boox.com/repository/maven-public/` plus `https://jitpack.io`; I used the **https** maven-public URL from the ticket and did not add jitpack (the demo adds it for the scribble SDK's dbflow dependency; if Gradle can't resolve a transitive dependency of `onyxsdk-device`, add `maven { url 'https://jitpack.io' }` in `android/build.gradle`).
- Confirmed in the demo docs: `EpdController.setViewDefaultUpdateMode(view, UpdateMode.GU|REGAL)`, `EpdController.invalidate(view, UpdateMode.GC)`, `EpdController.applyApplicationFastMode(APP, boolean, clear)`, `EpdController.setWebViewContrastOptimize(WebView, boolean)` ("prevents WebViews entering A2 mode"). `UpdateMode` constants: DU, DU_QUALITY, GU, GU_FAST (deprecated), GC, GC_4 (deprecated), ANIMATION, ANIMATION_QUALITY, REGAL, REGAL_D.
- **Not confirmed:** `EpdController.resetViewUpdateMode` (not in the docs; not used: normal mode is `setViewDefaultUpdateMode(view, REGAL)` instead). The import packages `com.onyx.android.sdk.api.device.epd.{EpdController,UpdateMode}` are from memory; if the build fails on those imports, fix them first.
- Mapping used: fast=`ANIMATION`, normal=`REGAL`, full=`GC` (via `invalidate`). Ticket 16 can change fast to `DU`/`ANIMATION_QUALITY`, or try `applyApplicationFastMode` / `setWebViewContrastOptimize`; the constants are in one place in `EInkPlugin.kt`.
- Kotlin was not in the project (Java only). I added the Kotlin Gradle plugin 2.2.20 (`android/build.gradle`, `org.jetbrains.kotlin.android` in `android/app/build.gradle`); the version is a guess that fits AGP 8.13 and may need bumping.

**Design.** `src/platform/eink.ts` (plugin + browser no-op fallback), `refreshPolicy.ts` (`RefreshPolicy`: first text-changing key in the editor -> fast; 1500 ms idle -> normal + full refresh; `pageTurn()` / `overlayChanged()` -> normal + full refresh immediately), `latency.ts` (stats, `KeyTimer`). `App.tsx` wires keydown (capture, `.cm-content` only, text-changing keys), page changes (`shownPage`) and open/close of drawer, snapshots, title form and debug panel. All plugin errors are swallowed. For ticket 15 (volume keys): add key forwarding in `EInkPlugin.kt` (see the comment there) and call `policy.pageTurn()`; the policy object lives in `App`.
- Debug panel: `Ctrl+Shift+D` or long-press the document name (800 ms). It sits below the editor; "Type test" shows a sample paragraph. Ctrl+D (variable drawer) now ignores Shift so it doesn't also fire.
- Global no-animation CSS was already in `styles.css` (ticket 01); `test/noAnimation.test.ts` now fails if any other `transition`/`animation` declaration appears in `src/` (engine excluded; its `transition:` is an element type).

**Browser-side numbers:** none meaningful. The only measurement was in a hidden headless pane where `requestAnimationFrame` is throttled, so figures would mislead. The decision record has empty tables for the owner.

**Owner checks**
- (build) Install JDK/SDK per `docs/android-dev-setup-macos.md` and run `npm run apk`; report any Gradle/Kotlin/Onyx-import errors. Ticks "plugin builds".
- (manual) Run on a non-Onyx emulator: app starts, typing works, no crashes (calls resolve and do nothing).
- (manual) `npm run dev`, open a script, press `Ctrl+Shift+D`: panel appears, type, numbers fill in. (The panel and key timing were verified only in an isolated mount, not through the full `App`.)
- (device) Fast mode visibly reduces typing lag on the Note Air 6C; ghosting clears after the 1.5 s pause.
- (device) Follow `docs/latency-test.md`, fill in `docs/decisions/0001-editor-surface.md`, record GO/NO-GO. If NO-GO: stop per the ticket.
