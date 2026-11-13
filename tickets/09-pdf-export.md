---
id: 09
title: PDF export
status: todo
blocked_by: [04, 06, 07]
model: sonnet
---

# 09: PDF export

**Read first:** `SPEC.md` → stories 36, 40, 52, 53, 56 and the *PDF generation* decision; tickets 04, 06 and 07 Handoff notes.

## What to build

Export the script to a PDF that matches the print view **exactly**, because both are drawn from the same page layout (`PagedScript`). The export includes the title page, an optional watermark and optional scene numbers, and lets the writer choose whether variables are filled in or kept. Before exporting, the app warns about undefined variables. The PDF is saved through the file picker or the Android share sheet.

## Decisions

- **Library:** `pdf-lib` + `@pdf-lib/fontkit`, embedding the bundled Courier Prime TTFs (Regular, Bold, Italic, Bold Italic). No network access and no system fonts.
- `exportPdf(paged: PagedScript, options): Promise<Uint8Array>` lives in the Script Engine. It is pure: pass the font bytes in through `options.fonts`, so the engine stays free of I/O.
- **Coordinates:** convert inches to PDF points (×72). Each `PositionedLine` has `xIn` and `yLine`; compute the y position as `pageHeightPt − topMarginPt − (yLine × 12pt) − ascent adjustment`. Use one helper for this, and check it against the print view (see acceptance criteria).
- **Styles:** bold, italic and underline spans from the parser map to font variants. Underline is drawn as a line 1pt below the baseline, 0.5pt thick.
- **Watermark** (optional text, e.g. "CONFIDENTIAL – DRAFT 3"): drawn diagonally at 45° in the centre of every page except the title page, Helvetica-Bold 60pt at 12% grey opacity, so it stays readable when printed and on e-ink.
- **Metadata:** the PDF title comes from the title page, the author from Author, and the creator is "Scriptwriter". **The creation and modification dates come from `options.now`**, so tests can produce identical PDFs.
- **Export dialog** (`Ctrl+E`, a modal with no animation):
  - Format: PDF (FDX and Fountain are added in ticket 10; design the dialog so they are just two more options)
  - Paper: US Letter / A4 (defaults to the current setting)
  - Scene numbers: off / both
  - Variables: **Fill in values** (default) / **Keep `{{KEY}}`**
  - Watermark: an optional text field
  - Include title page: yes/no
  - **Warnings panel:** if `resolve` reports `undefined` keys, list them, each with a [Define] button that opens the drawer at that key, and disable [Export] until the writer either defines them or ticks "Export anyway (print `{{KEY}}`)".
  - Buttons: [Save to file…] (storage port `pickCreate`, with the suggested name `<title> – <yyyy-mm-dd>.pdf`) and [Share…] (write to the app cache, then `@capacitor/share`).
- Remember the last-used export options per document in Preferences.

## Acceptance criteria

- [ ] Engine tests use `pdfjs-dist` (a development-only dependency) to read the generated PDF:
  - the page count equals `PagedScript.pageCount` (+1 with the title page)
  - the text on each page matches the golden page text for 3 fixtures (compare normalised text, not positions)
  - watermark text is present on every body page and absent from the title page
  - the `keep` mode PDF contains `{{HERO}}`; the `resolve` mode PDF contains the value
  - PDF bytes are identical across runs with a fixed `options.now`
- [ ] **Position check:** for one fixture, extract the x/y of 5 known lines from the PDF and assert that each is within 1pt of the inch values in `PagedScript`.
- [ ] The export dialog blocks export when undefined keys exist, until they are resolved or overridden (component test or manual check).
- [ ] Save and Share both work in the browser (Share falls back to a download).
- [ ] (device) A PDF exported on the Boox opens on the Mac and looks the same as the print view on the tablet (compare 3 pages side by side).
- [ ] (manual) Print one page to paper or "Save as PDF" on the Mac and measure it: the dialogue left edge is 2.5 in ± 0.05 in from the page edge.

## Out of scope

FDX and Fountain export (ticket 10), revision colours and headers (Phase 3).

## Handoff notes

_(Fill in: the export dialog's extension points for ticket 10.)_
