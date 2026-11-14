# Typing latency test (filmed)

The in-app debug panel only measures the browser side (keydown to the next animation frame after
CodeMirror updated). It cannot see the e-ink panel's own refresh, which is the slow part. This test
measures what you actually see. Record the result in `docs/decisions/0001-editor-surface.md`.

## What you need

- The Note Air 6C with the debug APK and a Bluetooth keyboard.
- A phone that films slow motion at 240 fps (iPhone: Camera → Slo-mo → 1080p at 240 fps).
- A steady spot so the phone sees both the keyboard keys and the e-ink screen in one frame.

## Steps

1. Open a script in the app. Make sure the Boox's own per-app refresh setting is at its default
   (note it in the record if you changed it).
2. Open the debug panel: press `Ctrl+Shift+D`, or long-press the document name in the top bar.
3. Run the **fast** case first: tick "Fast refresh while typing". Press **Reset** so the table is
   empty.
4. Start filming. Press **Type test**, then copy-type the sample paragraph into the editor at a
   normal pace. Press a few isolated single keys with a pause between them too.
5. Repeat with "Fast refresh while typing" unticked (**fast off**).
6. Stop filming. Read the panel's median and 95th-percentile numbers for both rows and write them
   down.

## Counting frames

1. Open the clip in a player that steps frame by frame (QuickTime: arrow keys; or Photos).
2. For 8 to 10 isolated key presses per case, find the frame where the key visibly reaches the
   bottom of its travel, and the frame where the glyph first appears on the screen.
3. Delay in ms = (glyph frame − key frame) × (1000 / 240) ≈ 4.17 ms per frame.
4. Take the median of your 8 to 10 numbers per case. Also note how it feels: fluid, laggy, or
   dropping characters?

## Result table (copy into the decision record)

| Case | Browser median (panel) | Browser 95th pct (panel) | Filmed median (ms) | Feels |
| --- | --- | --- | --- | --- |
| Fast refresh on | | | | |
| Fast refresh off | | | | |

## Decision rule

**GO** if the filmed median in fast mode is under about 150 ms and typing feels fluid. Otherwise
**NO-GO**; see the fallbacks in the decision record.
