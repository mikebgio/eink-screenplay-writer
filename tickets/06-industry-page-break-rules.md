---
id: 06
title: Industry page-break rules
status: done
blocked_by: [05]
model: sonnet
---

# 06: Industry page-break rules

**Read first:** `SPEC.md` → stories 21, 22, 42, 44 and *Further Notes* (biggest risk); ticket 05 Handoff notes (the PagedScript shape and golden helper). **Use high reasoning effort: this is the riskiest logic in Phase 1.**

## What to build

Replace ticket 05's "move the whole element" behaviour with the conventions professional screenplay software follows, so the page count is trustworthy. Add dual dialogue layout, automatic (CONT'D) and scene numbers. Every rule gets its own golden fixture.

## Rules (implement exactly; each line is one or more fixtures)

Terms: a *dialogue block* is a character cue, then any parentheticals and dialogue, until the next element of another type. "Lines" means printed lines after wrapping.

1. **Scene heading:** never the last thing on a page. If fewer than 2 lines of the following element fit after it, move the heading (and the blank line before it) to the next page.
2. **Character cue:** never alone at the bottom of a page. It must be followed on the same page by at least its first parenthetical (if there is one) **and** at least 1 line of dialogue. Otherwise move the whole dialogue block.
3. **Parenthetical:** never the last line before a break. If dialogue is split right after a parenthetical, move the parenthetical to the next page.
4. **Splitting dialogue:** a dialogue block may be split only if at least **2** lines of dialogue stay on the first page and at least **2** move to the next, and only at a **sentence boundary** (after `.`, `?`, `!` or `…`, optionally followed by a closing quote or bracket, then a space). If no such boundary exists, move the whole block.
   - At the bottom of the first page, add `(MORE)` at the character-cue indent (3.7 in).
   - At the top of the next page, repeat the cue as `NAME (CONT'D)`. If the cue already has an extension, keep it: `NAME (V.O.) (CONT'D)` → print as `NAME (V.O.) (CONT'D)`.
   - `(MORE)` takes one body line; account for it when deciding the split.
5. **Splitting action:** an action block may be split at a sentence boundary when at least 2 lines stay and at least 2 move. Otherwise move the whole block. No `(MORE)` for action.
6. **Transition:** never alone at the top of a page. If it would start a new page, **move the last 2 lines of the previous element with it**, splitting that element by rule 4 (dialogue) or rule 5 (action). If no valid split exists, keep the transition at the bottom of the current page by letting that page run **1** line over (allowed only for transitions).
7. **Dual dialogue:** two dialogue blocks printed side by side. Left column: cue at 3.0 in, dialogue at 1.5 in, width 28 characters. Right column: cue at 6.2 in, dialogue at 4.5 in, width 28 characters (make these constants easy to find and adjust). The pair's height is the taller column. **Never split a dual dialogue pair**; move it whole.
8. **Automatic (CONT'D):** if a character speaks, then only action follows (no other character cue, no scene heading), and the same character speaks again *in the same scene*, print the second cue with ` (CONT'D)`. This is a print-time decoration and never changes the source text. On by default; option `autoContd: boolean`. Don't add it if the source cue already says CONT'D.
9. **Scene numbers:** option `sceneNumbers: 'off' | 'both'`. When on, print each heading's number at 1.0 in (left) and with its right edge at 7.75 in (right). Numbers come from a forced `#…#` if present; otherwise number scenes sequentially 1, 2, 3… skipping forced numbers that are already used.
10. **Page-break element** `===`: always starts a new page, with no blank line at the top.
11. The **first page** of the body has no page number. Other pages print `n.` at the top right.

## Implementation guidance

- Separate *measurement* (wrap each element into lines, which is pure and cached per element) from *placement* (walking the elements and filling pages). Placement is where these rules live: a loop with a "remaining lines" counter that asks each rule whether to place the block, split it, or move it whole.
- Put the rules in one module of small named functions (e.g. `canSplitDialogue`, `findSentenceBreak`), each with doc comments that quote the rule number above. Test them **only through `paginate`** with fixtures, not one by one.
- Keep everything deterministic, with no dependence on the system locale.

## Acceptance criteria

- [x] Golden fixtures exist and have been reviewed by eye for: 1 (heading at page bottom), 2 (cue at bottom), 3 (parenthetical at the break), 4 (dialogue split at a sentence: MORE/CONT'D; extension kept; no sentence boundary → moved whole; fewer than 2 lines → moved whole), 5 (action split and moved whole), 6 (transition), 7 (dual dialogue fits; dual dialogue moved whole), 8 (CONT'D added; not added after a different character speaks; not added across scenes; not doubled; switched off by the option), 9 (scene numbers sequential and forced), 10, 11.
- [x] Rule constants (indents, widths, minimum split lines) are in one exported config object.
- [x] A 120-page benchmark still paginates in under 50 ms, or in a worker.
- [x] A **page-count check:** take 3 scripts that are free to use (write your own sample scripts or use the Fountain project's own samples, keeping the licence notes), paginate them, and record the page counts in Handoff notes. The owner will compare with Final Draft or Beat output; a difference of more than 3% gets a follow-up ticket.
- [x] The print view and the earlier golden tests are updated, and the changes to old goldens have been reviewed.

## Out of scope

Revision marks, locked pages, A-pages (Phase 3).

## Handoff notes

**API:** `paginate(doc, spec = US_LETTER, options?: Partial<PaginateOptions>)` with `PaginateOptions = { autoContd: boolean (default true); sceneNumbers: 'off' | 'both' (default 'off') }`. All rule numbers live in the exported `PAGE_RULES` object (`src/engine/pageRules.ts`: indents, widths, `minSplitLines`, `transitionOverrunLines`, the dual-dialogue columns, scene-number margins). `pageRules.ts` also holds the small pure helpers (`findSentenceBreaks`, `endsSentence`, `withContd`, `assignSceneNumbers`, `contdFlags`); the placement loop is in `paginate.ts` (`planSplit`, `placeBlock`, `placeTransition`, `keepsCompany`). The UI calls `paginate(doc)` with the defaults, so (CONT'D) is on and scene numbers off; there is no settings UI for the options yet (ticket 15 can wire it).

**Output changes:** two new `LineKind`s: `'more'` (the `(MORE)` line, x = 3.7 in, `elementIndex` of the last dialogue element on the page) and `'scene-number'` (two lines per numbered heading, on the heading's first row, same `elementIndex` as the heading). A repeated cue `NAME (CONT'D)` keeps the original cue's `elementIndex`. `renderPageText` now sorts a row's lines by x so side-by-side columns render correctly.

**Settled ambiguities (all covered by tests):**

- Rule 4 counts only dialogue lines (not the cue or parentheticals) for the "2 stay / 2 move" minimum, and `(MORE)` takes one of the page's rows. The end of a dialogue element is a valid split point if its text ends with `.?!…`+closing quote/bracket (so a block can break between a dialogue and the parenthetical after it). Rule 3 follows from that: the first half can never end on a parenthetical. The sentence test is purely lexical: "Mr. Smith" counts as a boundary.
- A split happens inside a printed line when the sentence ends there; the second half is re-wrapped from column 0.
- Rule 6: the transition pulls over the *smallest* tail that is a valid split (at least 2 lines), which can be more than 2 lines when sentences are long. If no split is possible, it stays at the bottom if `row + lines <= bodyLines + 1` (its blank line is dropped first if that is what it takes); otherwise it goes alone to the next page. A transition straight after `===` is alone at the top by design.
- Rule 1: a heading is kept only if the next block would put something on the page: at least 2 lines (valid split), or the whole element if it fits. It chains (heading, heading, action). A heading followed by `===` or the end of the script is left alone.
- Rule 8: needs at least one action between the two speeches; any heading, transition, centered, lyric or dual dialogue resets it; `===` and unprinted notes/sections do not. Characters are compared by identity (name without extension), so `MARA (V.O.)` then `MARA` counts as the same speaker. Output is `NAME (V.O.) (CONT'D)`. Not added if the source cue already contains `CONT'D`.
- Rule 7: the ticket gave cue/dialogue positions and a width of 28; I also chose parentheticals at 2.1 in (left) and 5.1 in (right) with width 20, and a cue wrap width of 20 (so a right-hand cue stays on the paper). All of these are in `PAGE_RULES.dual`. A dual pair taller than a page is not split (last resort: it starts at the top and runs off).
- A block taller than a page still splits by the rules when it can, otherwise at a line boundary (no `(MORE)`).
- Rule 10: `===` when the page is already empty does nothing, so no blank pages.

**Tests:** `test/pagebreaks.test.ts` has a golden per rule (`test/golden/pagebreaks/`, 24 files), explicit assertions on each, and 60 seeded random scripts that check the invariants (no content lost or reordered, rows in range, no heading/cue/parenthetical last on a page, `(MORE)` always followed by a `(CONT'D)` cue, no transition alone at the top except after `===`). The ticket 05 goldens did not change. Performance: 126 pages in about 4 ms.

**Page counts** (US Letter, defaults; generated for this project by a script, so there are no licence constraints, in `test/fixtures/page-count/`; asserted by the tests):

| Script | Pages |
| --- | --- |
| `dialogue-heavy.fountain` | 105 |
| `action-heavy.fountain` | 83 |
| `mixed.fountain` | 104 |

**Owner checks:** import the three files into Final Draft or Beat and compare page counts (more than 3% apart means a follow-up ticket; 3% is about 3 pages on these). I read every golden file by eye, but you may want to look at the files named `rule-*.txt`.

**Review (PR #24):** fixed a dual pair taller than a page (now flows row by row), `(CONT'D)` detection (only the parenthesised extension counts, so `DISCONTD` is not mistaken for it) and `renderPageText` (sorts only within a row). Kept as designed, per the ticket: abbreviations like "Mr." count as sentence ends; the split is tried before the 1-line overrun (rule 6); a heading before `===` or at the end stays; only plain action splits (rule 5).

**Known limitation:** `pageIndexForLine` still maps a cursor anywhere in an element that is split across two pages to the page where it starts (the print view does not track a source line per printed line).
