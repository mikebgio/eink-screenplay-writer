---
id: 09
title: PDF export
status: needs-device
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

- [x] Engine tests use `pdfjs-dist` (a development-only dependency) to read the generated PDF:
  - the page count equals `PagedScript.pageCount` (+1 with the title page)
  - the text on each page matches the golden page text for 3 fixtures (compare normalised text, not positions)
  - watermark text is present on every body page and absent from the title page
  - the `keep` mode PDF contains `{{HERO}}`; the `resolve` mode PDF contains the value
  - PDF bytes are identical across runs with a fixed `options.now`
- [x] **Position check:** for one fixture, extract the x/y of 5 known lines from the PDF and assert that each is within 1pt of the inch values in `PagedScript`.
- [x] The export dialog blocks export when undefined keys exist, until they are resolved or overridden (component test or manual check).
- [x] Save and Share both work in the browser (Share falls back to a download).
- [ ] (device) A PDF exported on the Boox opens on the Mac and looks the same as the print view on the tablet (compare 3 pages side by side).
- [ ] (manual) Print one page to paper or "Save as PDF" on the Mac and measure it: the dialogue left edge is 2.5 in ± 0.05 in from the page edge.

## Out of scope

FDX and Fountain export (ticket 10), revision colours and headers (Phase 3).

## Handoff notes

**API (engine):** `exportPdf(paged: PagedScript, options: PdfOptions): Promise<Uint8Array>` in `src/engine/exportPdf.ts`, exported from `src/engine`. `PdfOptions = { fonts: PdfFonts, now: Date, watermark?: string, includeTitlePage?: boolean (default true) }`; `PdfFonts = { regular, bold, italic, boldItalic }` as TTF `Uint8Array`s. It draws exactly the lines of `PagedScript` (title page first, then body pages), so paper size, scene numbers, resolved or kept variables and the (MORE)/(CONT'D) rules all come from `paginate` and `resolve`; callers choose them before calling. Also exported: `baselineY(pageHeightIn, topMarginIn, yLine, baselineOffset)` (the one place rows become PDF y) and `baselineOffsetPt(metrics)`.

**Decisions I made:**

- **Baseline:** a print-view line is a 12pt box with `line-height: 12pt`, and the browser centres Courier Prime's ascent + descent (1600 + 700 of 2048 units) in it, so the baseline is 8.64pt below the top of the line. The PDF uses the same number, read from the font with fontkit. The "ascent adjustment" in the ticket is that value.
- **Reading order:** lines are drawn sorted by (row, x), so the PDF text layer reads like the page. The goldens' normalised text is compared in that order.
- **Styles:** a line is cut at every style boundary, and each piece uses the regular, bold, italic or bold-italic face, advanced by the font's real advance width (1228/2048 em, not exactly 7.2pt, to match the browser). Underline is a 0.5pt line 1pt below the baseline.
- **Watermark:** Helvetica-Bold 60pt, black at 12% opacity, rotated 45° about the page centre, drawn *behind* the text, on every page except the title page. Characters Helvetica (WinAnsi) can't draw are dropped, so a stray emoji can't abort an export.
- **Determinism:** `PDFDocument.create({ updateMetadata: false })`, dates only from `options.now`, fixed font names (pdf-lib adds a random suffix otherwise), no object streams. Only the faces a script uses are embedded, subset to the glyphs drawn (about 14-20 KB for a short script).
- **Warnings panel only applies in Fill mode.** In Keep mode every key prints as `{{KEY}}` on purpose, so blocking on undefined keys there would be noise. The ticket does not say either way; tell me if you want it to block in both.
- **"Export anyway" is not remembered** (every other option is, per document, in Preferences under `export.options.<file uri>`).
- **The default paper is US Letter**: there is no paper setting in the app yet (ticket 15 can add one and pass it as the dialog's default).
- **No dialog component test:** the app's tests run in Node with no DOM. The gating rule is a pure function (`blockingKeys`, `src/ui/exportOptions.ts`) with unit tests, and I ran the dialog in the browser (see Owner checks).
- **Tests** are `test/exportPdf.test.ts` (engine, via `pdfjs-dist` legacy build, a dev-only dependency) and `test/export.test.ts` (options, file naming, `saveExport` against `MemoryStorage`, and the PDF format end to end). The text goldens are the existing `test/golden/paginate/{dialogue,emphasis,title-page}.txt`, so no new golden files. I checked the position test fails when the baseline is off by 2pt.

**Storage port change:** `StoragePort.writeBytes(ref, bytes)` is new (a PDF is not text), implemented in `MemoryStorage` (`.bytes` map), `FsAccessStorage`, `NativeStorage` (base64 over the bridge, `DocumentStorePlugin.writeBytes`) and `LocalStorageFolder` (which has no binary storage; a non-Fountain name there is saved as a **download**). `pickCreate(suggestedName)` now picks the file type from the extension (`.pdf`, `.fdx`, else Fountain/text), on Chrome and on Android (`mimeType`). Helpers: `src/storage/exportFile.ts` (`suggestedExportName` gives `<title> – <yyyy-mm-dd>.<ext>`, `saveExport`, `exportBytes`), `src/storage/bytes.ts` (`toBase64`), `mimeForName` in `port.ts`. Share: `shareFile(name, bytes, mime)` in `src/platform/share.ts` (Android: writes to `Directory.Cache`, then `@capacitor/share` with the file; browser: Web Share with files if the browser has it, else a download). `loadPdfFonts()` in `src/platform/pdfFonts.ts` fetches the four Courier Prime TTFs once (the same files the print view loads).

**For ticket 10: how to add an export format (FDX, Fountain).** The dialog is `ExportDialog` (`src/ui/ExportDialog.tsx`) and its format switch is the **`EXPORT_FORMATS` array in `src/ui/exportFormats.ts`**. You normally touch only that array and your own file:

1. Write an `ExportFormat` (same file as `PDF_FORMAT`, or your own module):
   ```ts
   export const FDX_FORMAT: ExportFormat = {
     id: 'fdx',                       // stored in the remembered options: never rename
     label: 'Final Draft (FDX)',      // the radio label
     extension: 'fdx',                // file name and save-picker type
     mime: 'application/xml',         // share sheet / download
     controls: ['variables'],         // which option controls the dialog shows for it
     async run({ text, options, now }) {   // ExportContext, see exportOptions.ts
       const resolved = resolve(parse(text), { mode: options.variables === 'keep' ? 'keep' : 'resolve' });
       return exportFdx(resolved.doc);     // string (saved as UTF-8) or Uint8Array
     },
   };
   ```
2. Add it to `EXPORT_FORMATS` (`[PDF_FORMAT, FDX_FORMAT, FOUNTAIN_FORMAT]`). The radio, the filtered controls, the file name (`suggestedExportName`), Save and Share all follow from the entry.

- `ExportContext` is `{ text, options, now, fonts }`: `text` is the script as written (variables unresolved), `options` is the dialog's `ExportOptions`, and `fonts` loads the PDF fonts on demand (ignore it).
- `controls` is any of `'paper' | 'sceneNumbers' | 'variables' | 'watermark' | 'titlePage'` (`ExportControl`). A format that lists `'variables'` also gets the undefined-variable warnings and the [Define] / "Export anyway" gate in Fill mode; leave it out and the format is never blocked. Controls it does not list are hidden. If you need a new control, add it to `ExportControl`, to `ExportOptions` and `parseExportOptions` (`exportOptions.ts`), and to the dialog's markup.
- `parseExportOptions` validates the remembered `format` against the registry's ids, so a missing format falls back to the first one.
- Tests: call `format.run(ctx)` directly (see the `PDF format` block in `test/export.test.ts`; fonts can be `async () => ...` stubs for text formats).
- Nothing else needs to change: Ctrl+E (`export.open`), the **Export** button in the document bar, the Preferences key, and the toast live in `App.tsx`.

**Other changes:** `VariableDrawer` takes an optional `focus={{ key, seq }}` that opens its "add a value" row for that key and focuses the value box (used by [Define]). The dialog closes when [Define] is pressed, and the drawer opens. `.modal` styles in `styles.css` are reused; export styles are at the end of that file (`.export-form`, `.export-warning`).

**Build notes:** new dependencies `pdf-lib`, `@pdf-lib/fontkit`, `@capacitor/share` (runtime) and `pdfjs-dist` (dev). `npm run android` (cap sync) must run before the next APK so `@capacitor/share` is registered. The bundle grew to about 1.58 MB (about 650 KB gzipped); PDF code is only needed on export, so ticket 16 can lazy-load `exportPdf` with a dynamic import if start-up is slow on the Boox. If `npm install` fails with a root-owned `~/.npm` cache, pass `--cache <dir>`.

**Owner checks:**
- (device) A PDF exported on the Boox opens on the Mac and looks the same as the print view on the tablet (compare 3 pages side by side).
- (manual) Print one page to paper or "Save as PDF" on the Mac and measure: the dialogue left edge is 2.5 in ± 0.05 in from the page edge. (The engine test already asserts the PDF x is 2.5 in.)
- (device) **[Save to file…] on Android:** the `DocumentStorePlugin.writeBytes` and `pickCreate` `mimeType` changes in `DocumentStorePlugin.java` have not been compiled or run; build with `npm run apk` and save a PDF to local storage and to Drive.
- (device) **[Share…] on Android:** the share sheet shows the PDF and sends it (for example to Drive or email). Not run: needs the build above.
- (Chrome) Save was checked in the Claude app's browser pane with a **stubbed** file picker (the pane's real picker can't write): the dialog opened with Ctrl+E, Save and Share were disabled with an undefined key, [Define] opened the drawer at that key with the value box focused, defining it unblocked the export, options were remembered per document, Save wrote a 20 KB `%PDF-1.7` named `Big Fish – 2026-11-14.pdf` with the PDF save-picker type, and Share (no Web Share in that pane) fell back to a download. Try it once in real Chrome with the real picker.
