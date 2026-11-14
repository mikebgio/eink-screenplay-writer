# 0001: Editor surface (WebView + CodeMirror)

Status: **OPEN — owner to fill in the GO / NO-GO below.**

## Question

Is typing in a CodeMirror 6 editor inside the Android WebView fast enough on the Boox Note Air 6C?
(SPEC → Further Notes, "second risk".) Ticket 02 builds the measurement tools; the owner records
the result.

## Context

- Provisional informal GO (PLAN.md D4, 2026-11-13): with the Boox's own fast-refresh setting on,
  typing felt "somewhat acceptable". Further tuning is ticket 16.
- The app now switches the Onyx refresh mode itself (fast while typing, full refresh after 1.5 s
  idle, on page turns and when dialogs or drawers open or close).

## Decision rule

**GO** if the median keypress-to-glyph delay in fast mode is under about 150 ms and typing feels
fluid. Otherwise **NO-GO**.

## Measurements

Browser side (debug panel, `Ctrl+Shift+D`; last 200 keys). Desktop-browser reference numbers are
not meaningful for the decision; record the Boox numbers.

| Case | Median (ms) | 95th pct (ms) | Keys |
| --- | --- | --- | --- |
| Boox, fast refresh on | | | |
| Boox, fast refresh off | | | |

Filmed (see `docs/latency-test.md`):

| Case | Median (ms) | Feels |
| --- | --- | --- |
| Fast refresh on | | |
| Fast refresh off | | |

Device, date, app build, Boox refresh settings: _fill in_

## Result

**GO / NO-GO:** _fill in_

Notes: _fill in_

## If NO-GO: fallbacks

1. A native Android `EditText` editor, with the Script Engine run in an embedded JavaScript
   runtime (e.g. QuickJS).
2. A native `EditText` editor with the Script Engine ported to Kotlin (costly; the golden tests
   would port too).

If NO-GO: set ticket 02 to `needs-device`, write a summary at the top of `PLAN.md`, and stop.
Later UI tickets must be re-planned.
