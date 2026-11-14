---
id: 10
title: FDX and Fountain exchange
status: needs-device
blocked_by: [03, 04, 07]
model: sonnet
---

# 10: FDX and Fountain exchange

**Read first:** `SPEC.md` → stories 14, 54, 55; tickets 03, 04 and 07 Handoff notes. If ticket 09 is done, read its Handoff notes too (the export dialog).

## What to build

1. **FDX export:** a Final Draft `.fdx` file that Final Draft (and Fade In, WriterDuet and Highland) can open.
2. **FDX import:** open an `.fdx` file and convert it to a new `.fountain` file.
3. **Fountain export with variables filled in:** a clean `.fountain` copy without the `Var-` lines, for someone who doesn't use the drawer.

## Decisions

- Engine functions (pure):
  - `exportFdx(resolved: ResolvedDocument): string`
  - `importFdx(xml: string): string` (returns Fountain text)
  - `toFountain(doc: ScriptDocument | ResolvedDocument, opts: { dropVariables: boolean }): string`
- **XML:** parsing needs `DOMParser`, which isn't available in the pure engine, so use a small XML parsing library with no DOM dependency (e.g. `fast-xml-parser`). Writing XML is plain string building with proper escaping of `& < > " '`.
- **FDX structure** (Final Draft 8 and later):

  ```xml
  <?xml version="1.0" encoding="UTF-8" standalone="no" ?>
  <FinalDraft DocumentType="Script" Template="No" Version="5">
    <Content>
      <Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - NIGHT</Text></Paragraph>
      <Paragraph Type="Action"><Text>Rain hammers the window.</Text></Paragraph>
      <Paragraph Type="Character"><Text>MAYA</Text></Paragraph>
      <Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>We're not alone.</Text></Paragraph>
      <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
    </Content>
    <TitlePage><Content> … Paragraphs with Alignment="Center" … </Content></TitlePage>
  </FinalDraft>
  ```

  - Element mapping: scene_heading → `Scene Heading`; action → `Action`; character → `Character`; parenthetical → `Parenthetical`; dialogue → `Dialogue`; transition → `Transition`; centered → `Action` with `Alignment="Center"`; lyric → `Dialogue` with `<Text Style="Italic">`; page_break → `StartsNewPage="Yes"` on the next paragraph.
  - Sections, synopses, notes and boneyard are **not** exported, except that notes may become a `<ScriptNote>` if that's simple. Optional; skip otherwise.
  - **Dual dialogue:** wrap both dialogue blocks in `<Paragraph><DualDialogue> … </DualDialogue></Paragraph>`.
  - **Styles:** split `<Text>` runs at style boundaries, with `Style="Bold"`, `"Italic"`, `"Underline"` or combinations joined with `+`.
  - Scene numbers go in the `Number` attribute only when the export option is on.
  - **Check the format** against a real FDX: if the owner can provide one exported from Final Draft or Fade In, use it as an import fixture. Otherwise use the public sample FDX files that come with open-source projects and keep their licence notes. Record which you used.
- **Import mapping:** the reverse of the above. Unknown paragraph types (`General`, `Shot`, `Cast List`, …) → action; `Shot` → a forced scene heading only if it's capitalised, otherwise action. Title-page paragraphs → title-page keys (a best guess: the first centred line is Title, a line containing "by" or "written" is Credit, the next is Author). Write the Fountain with forcing characters wherever the classifier would otherwise misread a line.
- **`toFountain` round trip:** `parse(toFountain(parse(x)))` must equal `parse(x)` on element types and text, for every parse fixture from ticket 03. Use forcing characters (`!` for capitalised action, `@` for cues Fountain wouldn't recognise, `.` for unusual headings) to keep it lossless.
- **UI:**
  - Add *FDX* and *Fountain (values filled in)* as formats in the export dialog (ticket 09). If 09 isn't done yet, add a minimal export menu that 09 will absorb.
  - Opening an `.fdx` file from the start screen converts it; the writer is then asked where to save the new `.fountain` file (`pickCreate`), and it opens in the editor.

## Acceptance criteria

- [x] `toFountain` round-trip test over all ticket 03 parse fixtures.
- [x] FDX round trip: `importFdx(exportFdx(resolve(parse(x))))` parses to the same element types and text for at least 6 fixtures, including dual dialogue, styles and a title page.
- [x] Exported FDX is well-formed XML (parsed back in the test) and uses only the paragraph types listed.
- [x] At least one real FDX from outside this project imports without errors and gives sensible Fountain (golden file, reviewed).
- [x] The Fountain export with values filled in contains no `Var-` lines and no `{{` (except escaped literals).
- [ ] (manual) The owner opens an exported FDX in Final Draft, Fade In or Highland on the Mac and confirms the elements are formatted correctly.

## Out of scope

Revision data in FDX, ScriptNotes beyond the optional extra above, other formats (Celtx, Highland's own format).

## Handoff notes

**Status:** every criterion is ticked except the (manual) one. Checked in the dev-server browser pane on 2026-11-14 with stubbed file pickers: opening an `.fdx` from the start screen asked for a `.fountain` name (`Script.fountain`), wrote the converted text and opened it in the editor; the interim menu then saved `Script.fdx` and `Script (values filled in).fountain`.

### Engine API (`src/engine`, all exported from the index)

- `exportFdx(resolved: ResolvedDocument, opts?: { sceneNumbers?: boolean }): string`. `ResolvedDocument` is a new alias for `ScriptDocument` (what `resolve(...).doc` returns). With `sceneNumbers` every scene heading gets `Number`: a forced `#12A#` as written, the rest numbered by `assignSceneNumbers` (the same rule as the print view).
- `importFdx(xml: string): string` returns Fountain. Throws `Error('This is not a Final Draft (.fdx) file.')` for anything that isn't well-formed XML with a `FinalDraft` root, so callers can show `e.message`.
- `toFountain(doc, { dropVariables }): string`. `false` writes the document as it is (`Var-` lines and `{{KEY}}` kept). `true` is the clean copy: a document that still has `Var-` entries is **resolved first**, so `toFountain(parse(x), { dropVariables: true })` and `toFountain(resolve(parse(x)).doc, { dropVariables: true })` give the same text. Any `{{` left over (an undefined key, or an escaped literal that `resolve` already unescaped) is written as `\{{`, so no unescaped `{{` ever appears.
- `src/storage/exchange.ts` (no Capacitor or DOM): `exportFdxText(text, { sceneNumbers?, variables?: 'fill' | 'keep' })` and `exportFountainText(text)` take the script text as written, so they are the whole body of an export format's `run`. Also `exchangeFileName(name, 'fdx' | 'fountain', { filled? })`, `isFdxName`, `saveTextExport(storage, name, text)` and `importFdxFile(storage, ref)`.
- `writeFountain` and `markEmphasis` (`src/engine/fountainOut.ts`) are shared by `toFountain` and the importer; they are not exported from the index.

### How the Fountain writer stays lossless

`toFountain` writes each element from its display `text` and `styles`, not from `raw`, so it works for resolved documents. For every action, scene heading, cue and transition it parses the candidate line back (in the context of a preceding block) and uses a forcing character (`!`, `.`, `@`, `>`) only when the plain line would be read as something else; emphasis markers are escaped (`\*`, `\_`) only when that is needed. An action that would turn into a title page gets `!`. A second pass over its own output changes nothing (tested). Not kept: inline `[[notes]]` and boneyard inside an element's text (the parser already removes them from `text`); whole-line notes, boneyard, sections and synopses are kept. Spans that can't be written as Fountain markers (overlapping, or touching whitespace) lose their styling and keep the text.

### FDX details and quirks

- **Samples used:** `test/fixtures/fdx/final-draft.fdx` (a Final Draft export) and `test/fixtures/fdx/fade-in.fdx` (a Fade In export), both from [wildwinter/screenplay-tools](https://github.com/wildwinter/screenplay-tools) (`tests/TestFDX-FD.fdx`, `tests/TestFDX-FI.fdx`), MIT licence, copy in `test/fixtures/fdx/LICENSE-screenplay-tools.txt`. Both import to the same Fountain, reviewed and kept as `test/golden/exchange/*.fountain` (`UPDATE_GOLDEN=1` rewrites them). Neither sample has dual dialogue, styled runs or a `<Text>` with a leading space; those are covered by hand-written XML in `test/exchange.test.ts`, whose shape follows Final Draft's documented structure but has **not** been opened in Final Draft (see Owner checks).
- Only `FinalDraft/Content/Paragraph` and `FinalDraft/TitlePage/Content/Paragraph` are read. Real files repeat `Paragraph` inside `ElementSettings`, `HeaderAndFooter`, `Watermarking` and `SceneProperties`; all of that is ignored.
- Text is read with `fast-xml-parser` (`preserveOrder`, `trimValues: false`, `htmlEntities: true`; the deprecated flag is the only one that decodes numeric references such as `&#39;`). New dependency: `fast-xml-parser`. **Text may contain newlines:** Final Draft's own title page has `<Text>Draft\ninformation</Text>`, and multi-line action and dialogue are written the same way (one `<Paragraph>`, newlines inside `<Text>`). I could not check how Final Draft itself lays that out.
- Import: empty paragraphs (Final Draft pads with them) are dropped; `Number` becomes `#N#` (both samples carry them, so imported scripts have numbered headings); `StartsNewPage="Yes"` becomes a page break (ignored on the first paragraph); `Alignment="Center"` on an action becomes centred text; `Shot` is a forced heading only if capitalised; every other unknown type is action. A `Dialogue` that doesn't follow a character cue (or follows an empty one) is a **lyric** only if it is wholly italic (that is how lyrics are exported; the italic is removed), otherwise action. A `Dialogue` line wrapped in `( )` inside a cue group reads back as a parenthetical (Fountain has no escape for it; the text is kept). `StartsNewPage` on a `DualDialogue` wrapper is a page break; export puts it there, and a page break with nothing after it is not written. A `Parenthetical` outside a cue becomes action. Dual dialogue: the first `Character` in a `DualDialogue` starts the left half, the second the right half (`^`). Styles `Bold`, `Italic` and `Underline` (joined with `+`) are kept; `AllCaps`, `Strikeout` and the like are ignored. Style spans lose leading and trailing whitespace (Fountain markers can't touch it).
- **Title page, a best guess** (the ticket asked for one): paragraphs are grouped by alignment, separated by empty paragraphs. The first centred group is `Title` (several lines allowed); the next centred group that contains "by" or "written" is `Credit`; then `Author`, then `Source`; further centred groups go to `Notes`. Right-aligned text is `Draft date`. Left-aligned groups: with a right-aligned group they are all `Contact`; otherwise one group is `Contact`, two are `Draft date` and `Contact`, three or more are `Copyright` (the extras), `Draft date`, `Contact`, which matches Final Draft's own template. A left-aligned block that starts with `©`, `(c)` or `Copyright` is `Copyright` wherever it sits. Export writes Title, Credit, Author, Source and Notes centred, `Copyright` and `Contact` left-aligned and `Draft date` right-aligned; all eight round trip as long as Title to Source are present (Notes is read as "a fifth centred block") and Copyright starts as above. Custom keys are not exported, and `Var-` keys never are.
- **Export:** paragraphs have no `Number` unless asked; title-page paragraphs have no `Type` (as in Final Draft's own files). Version is `5`.

### For ticket 09 (the export dialog is not on `main` yet)

I read 09's work in progress (`src/ui/exportFormats.ts`) but have not built on it. What is on this branch instead is **interim and isolated**: `src/ui/ExchangeMenu.tsx` (two buttons and an "FDX scene numbers" checkbox, no shortcut so it can't clash with Ctrl+E), one `<ExchangeMenu … />` line in `App.tsx` next to the save status, and a small CSS block at the end of `styles.css` (it also lets `.doc-bar` wrap). It saves text through `storage.pickCreate` + `storage.write`.

**What remains once 09 is merged** (about ten lines):

1. Add two `ExportFormat` entries and list them in `EXPORT_FORMATS`:
   ```ts
   export const FDX_FORMAT: ExportFormat = {
     id: 'fdx', label: 'Final Draft (FDX)', extension: 'fdx', mime: 'application/xml',
     controls: ['sceneNumbers', 'variables'],
     async run({ text, options }) {
       return exportFdxText(text, {
         sceneNumbers: options.sceneNumbers === 'both',
         variables: options.variables === 'keep' ? 'keep' : 'fill',
       });
     },
   };
   export const FOUNTAIN_FORMAT: ExportFormat = {
     id: 'fountain', label: 'Fountain (values filled in)', extension: 'fountain', mime: 'text/plain',
     controls: ['variables'],            // Fill mode only: the copy always has the values in
     async run({ text }) { return exportFountainText(text); },
   };
   ```
   (`exportFdxText` and `exportFountainText` are from `src/storage/exchange.ts`; check the option names against 09's final `ExportOptions`.) With Fountain the `variables` control is only there for the undefined-key gate; if 09 lets a format hide the Keep choice, hide it for this one, because a Fountain copy with `{{KEY}}` kept is not what "values filled in" means.
2. Delete `src/ui/ExchangeMenu.tsx`, its import and element in `App.tsx`, and the `.exchange-menu` CSS (keep `.doc-bar { flex-wrap: wrap }` if the toolbar is still crowded).
3. `suggestedExportName` (09) names files `<title> – <date>.<ext>`; `exchangeFileName` here (`Script.fdx`, `Script (values filled in).fountain`) is only for the interim menu and the import.
4. `.fdx` saving needs 09's `pickCreate`, which picks the file type from the extension. Until then Chrome's save picker is limited to `.fountain` / `.txt`, and Android's `text/plain` create intent may append `.txt` to `Script.fdx`. Also check the Android open picker offers `.fdx` (it uses `*/*`, so it should).

**Open with FDX (done, in `App.tsx`):** `openFile` now calls `openPicked`, which sends an `.fdx` through `importFdxFile` (read, convert, ask where to save the `.fountain`, write, open) and anything else straight to `openRef`. Conversion happens before the save picker, so a bad file creates nothing. Not wired: workspace and recent lists only show `.fountain` and `.txt`, so an `.fdx` can only be opened with **Open file**; in Chrome the open picker is filtered to `.fountain` / `.txt`, so pick "All files" to see `.fdx`.

**Owner checks:**
- (manual) Open an exported `.fdx` in Final Draft, Fade In or Highland on the Mac and confirm scene headings, action, cues, parentheticals, dialogue, transitions, centred text, a lyric, dual dialogue, bold/italic/underline, a page break and the title page all look right. Please also say how multi-line action looks (newlines inside one `<Text>`).
- (manual) Open a real `.fdx` of your own through **Open file** and read the converted Fountain, especially the title page guess.
- (device) On the Boox, open an `.fdx` from Drive or local storage and save the converted file; saving `.fdx` / `.fountain` exports needs 09's picker change (above).
