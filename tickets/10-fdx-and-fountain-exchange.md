---
id: 10
title: FDX and Fountain exchange
status: todo
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

- [ ] `toFountain` round-trip test over all ticket 03 parse fixtures.
- [ ] FDX round trip: `importFdx(exportFdx(resolve(parse(x))))` parses to the same element types and text for at least 6 fixtures, including dual dialogue, styles and a title page.
- [ ] Exported FDX is well-formed XML (parsed back in the test) and uses only the paragraph types listed.
- [ ] At least one real FDX from outside this project imports without errors and gives sensible Fountain (golden file, reviewed).
- [ ] The Fountain export with values filled in contains no `Var-` lines and no `{{` (except escaped literals).
- [ ] (manual) The owner opens an exported FDX in Final Draft, Fade In or Highland on the Mac and confirms the elements are formatted correctly.

## Out of scope

Revision data in FDX, ScriptNotes beyond the optional extra above, other formats (Celtx, Highland's own format).

## Handoff notes

_(Fill in: which FDX samples were used and any quirks of other programs.)_
