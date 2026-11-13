---
id: 15
title: Display settings
status: todo
blocked_by: [02, 05]
model: haiku
---

# 15: Display settings

> **Model:** Haiku-suitable for everything except step 5 (volume keys, which needs native Android key handling): use **Sonnet** for step 5, or hand it back to Sonnet if the Kotlin side doesn't work first time.

**Read first:** `SPEC.md` → stories 45, 47, 58–61, 65; tickets 02 and 05 Handoff notes (the EInk plugin, layout modes, page navigation).

## What to build

A **Settings** screen and the display options a writer on e-ink needs:

1. themes
2. editor text size and line spacing
3. a distraction-free mode
4. a high-contrast check
5. volume-key page turning

None of these may change the printed layout.

## Steps

### 1. Settings screen and store

- A `settings` module with typed defaults, stored in Capacitor Preferences, with a simple subscribe/notify API. One version number in the stored object, so later settings changes can migrate old data.
- Settings screen (opened from the menu, or `Ctrl+,` via the command registry if ticket 08 is done): a single page of grouped options, no scrolling on a 1240×1860 viewport, large tap targets (at least 44 px).

### 2. Themes

- Use CSS custom properties on `:root` for every colour in the app (`--bg`, `--fg`, `--muted`, `--border`, `--accent`, `--selection`). **Replace any hard-coded colours** in existing components with these.
- Options: **Light** (pure white `#fff` background, pure black `#000` text: best contrast on e-ink), **Dark** (pure black background, white text), **System** (follow `prefers-color-scheme`).
- The theme applies to the editor, panels and dialogs. **The print view always shows white paper with black text**, whatever the theme, because it represents the printed page.
- After switching theme, call `EInk.fullRefresh()` to clear ghosting.

### 3. Editor text size and line spacing

- Font size: 14–32 px, step 2, default 20. Line spacing: 1.2 / 1.5 / 1.8 / 2.0, default 1.5. Editor font: Courier Prime (default) or the system sans-serif.
- These only affect the editor's CSS variables. Add a test that the `paginate` output for a fixture is identical whatever these settings are (the engine never sees them; the test makes sure nobody connects them later).

### 4. Distraction-free mode and contrast check

- `Ctrl+Shift+F` or a menu item hides every toolbar, panel and status line, leaving only the editor, or only the print view if it's in print-view-only layout. Esc or the same shortcut brings everything back. Briefly show "Esc to exit" when entering. Remember the state for the current session only.
- **High-contrast check:** look at every component with the CSS filter `grayscale(1)` applied (add a hidden debug toggle for this). Wherever information is shown by colour alone, add a text label, shape or pattern: e.g. undefined variables already use a dashed box; the active scene uses ▶; selected buttons use inverted colours, not just a coloured outline. List every fix in Handoff notes.

### 5. Volume-key page turning (Sonnet)

- In the Android `MainActivity` (or the EInk plugin from ticket 02), intercept `KEYCODE_VOLUME_DOWN` (next page) and `KEYCODE_VOLUME_UP` (previous page) **only when the setting "Volume keys turn pages" is on** (default on). Consume the event so the volume doesn't change, and forward it to JavaScript as a plugin event `pageKey` with `{ direction: 'next' | 'prev' }`.
- In JavaScript: if the print view or a paged panel (navigator, reports, comparison, conflict screen) has focus, turn its page; otherwise move the editor cursor by one screen of lines (no smooth scroll).
- If the setting is off, the volume keys behave normally.

## Acceptance criteria

- [ ] The settings store has tests: defaults, saving a value and reading it back, subscribers notified, and migration from a stored object with an older version number.
- [ ] Searching the code finds no hard-coded colours outside the theme variables file (except the print view's fixed white and black, which are named constants).
- [ ] The test that pagination ignores editor settings passes.
- [ ] Light/Dark/System work in the browser; the print view stays white.
- [ ] Distraction-free mode hides all controls and Esc restores them.
- [ ] The grayscale check is done and its fixes are listed in Handoff notes.
- [ ] (device) Volume keys turn pages in the print view and panels when the setting is on, and change the volume when it's off.
- [ ] (device) Switching theme on the Boox leaves no ghosting after the automatic full refresh.

## Out of scope

Custom colour themes, print font choice (always Courier Prime), revision page colours (Phase 3).

## Handoff notes

_(Fill in: list of contrast fixes, any Boox-specific quirks with key events.)_
