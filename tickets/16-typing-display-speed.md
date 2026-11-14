---
id: 16
title: Typing display speed optimisation
status: todo
blocked_by: [08, 09, 10, 12, 13, 14, 15]
model: sonnet
---

# 16: Typing display speed optimisation

**Read first:** `SPEC.md` → *Further Notes* (second risk); `PLAN.md` → *Agent rules* and decision D4; Handoff notes of tickets 01, 02, 08 and 15; `docs/latency-test.md` and `docs/decisions/0001-editor-surface.md` (both written by ticket 02).

## Why this exists

On 2026-11-13 the owner ran the ticket 01 build on the Note Air 6C. Typing was "somewhat acceptable", and only with the Boox's own fast-refresh setting switched on. That is good enough to finish the base prototype, not good enough to write a screenplay on.

This ticket is **deliberately last**. It is blocked by every end-of-chain ticket in the original plan, so it only becomes ready once the base prototype is complete. Don't start it early, even if its measuring tools already exist.

## What to build

Make typing feel fluid on the Note Air 6C by shortening the time from key press to the glyph appearing. Ticket 02 supplies the refresh plugin and the measuring tools; this ticket uses them to find and remove what is still slow.

Work measurement-first: record a baseline, change one thing, measure again, keep the change only if the numbers improve.

## Decisions

- **The editor surface stays** (WebView + CodeMirror 6). Replacing it is ticket 02's NO-GO fallback, not an optimisation. If nothing here gets typing to the target, stop and ask the owner.
- **Measure with ticket 02's tools:** the debug latency screen for browser-side numbers, and the 240 fps slow-motion method in `docs/latency-test.md` for the true key-to-glyph delay.
- **Target:** the same rule as ticket 02's GO line: median key-to-glyph delay under about 150 ms in fast mode, and the owner judges typing fluid.
- The refresh policy stays in `src/platform/`. UI components don't call the plugin directly.

## Things to investigate

Candidates, in rough order of expected payoff. Each one is a hypothesis to measure, not a required change.

1. **Keep print-view work off the typing path.** Ticket 01 runs `parse` → `paginate` → re-render 150 ms after each change, so a re-render can land in the middle of a typing burst and repaint half the screen. Try holding the print view until typing pauses (reuse the 1500 ms idle signal from ticket 02's refresh policy).
2. **Shrink what changes on screen per keystroke.** E-ink redraw cost grows with the changed area. Look for anything in the editor that repaints beyond the typed glyph: active-line highlight, gutters, bracket matching, autocomplete popups from ticket 08, status or word-count readouts from ticket 14, layout shifts.
3. **Re-render only what changed in the print view.** Skip pages and lines whose content is identical to the previous render.
4. **Tune the refresh policy.** Compare the Onyx fast modes verified in ticket 02 (A2, DU and so on) for typing, and try other idle timeouts than 1500 ms.
5. **Reduce engine cost on long scripts.** Measure `parse` + `paginate` on a 120-page fixture. If it is slow enough to matter, re-parse only from the edited element onwards.
6. **App-controlled fast mode.** Confirm whether the plugin's fast mode makes the Boox's own per-app fast-refresh setting unnecessary. If the system setting is still needed, document it in the README as a setup step.

## Acceptance criteria

- [ ] Baseline numbers (browser-side median and 95th percentile, fast mode on and off) are recorded in `docs/latency-test.md` before any change.
- [ ] Handoff notes hold a results table: each change tried, the numbers before and after, and whether it was kept. Changes that don't improve the numbers are reverted.
- [ ] No `parse`, `paginate` or print-view render runs during a typing burst; the print view catches up after typing pauses (unit-tested with fake timers).
- [ ] A 120-page fixture exists, and the time for `parse` + `paginate` on it is recorded in Handoff notes.
- [ ] The browser-side median key-to-frame delay is lower than the baseline.
- [ ] (device) Median key-to-glyph delay in fast mode is under about 150 ms, measured with the slow-motion method.
- [ ] (device) The owner judges typing fluid, and records whether the Boox's own fast-refresh setting is still needed.

## Out of scope

Replacing the editor surface, new features, changes to page layout or page-break rules.

## Handoff notes

_(Fill in: baseline numbers, results table, final refresh policy settings.)_
