---
id: 02
title: Typing-speed test and screen refresh control
status: todo
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
- [ ] The refresh policy is unit-tested with fake timers and a fake plugin: keystroke → fast; 1500 ms idle → fullRefresh + normal; page-turn event → fullRefresh.
- [ ] The global no-animation CSS is in place; searching the codebase finds no `transition`/`animation` declarations outside that reset.
- [ ] The debug latency screen works in a desktop browser.
- [ ] `docs/latency-test.md` and the `docs/decisions/0001-editor-surface.md` template exist.
- [ ] (device) Fast mode visibly reduces typing lag on the Note Air 6C; ghosting clears after the 1.5 s pause.
- [ ] (device) The owner records GO/NO-GO in the decision record. **If NO-GO, set this ticket to `needs-device`, write a summary at the top of `PLAN.md`, and stop. Later UI tickets must be re-planned.**

## Notes

- The Boox system also offers per-app refresh settings in its own app-optimisation menu. Mention them in the README as a manual fallback, but don't depend on them.
- Volume-key page turning is handled in ticket 15, which reuses this plugin. Leave a clear place in the plugin to add key-event forwarding.

## Handoff notes

_(Fill in: verified Onyx API names and SDK version, measured browser-side numbers.)_
