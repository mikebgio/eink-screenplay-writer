---
id: 19
title: CHANGELOG rules and check
status: in-progress
blocked_by: [17]
model: sonnet
plan: PLAN-2.md
---

# 19: CHANGELOG rules and check

**Read first:** `PLAN-2.md` → Track A spec, story 72, decision D11 (the rules themselves); `CHANGELOG.md`; ticket 17 Handoff notes.

## What to build

1. Write the CHANGELOG rules where Claude reads them on every session.
2. Add a check that fails a PR with no entry.
3. Bring `CHANGELOG.md` up to date.

## Decisions

### Where the rules live

Create `CLAUDE.md` at the repo root (there isn't one). Keep it short:

- two or three lines on what the project is, pointing to `SPEC.md`, `PLAN.md` and `PLAN-2.md`
- "run `npm run check` before finishing"
- a **CHANGELOG** section with the seven rules from D11, copied in full, plus one worked example of a good line and one of a bad line (implementation detail instead of outcome)
- the existing rule from `PLAN.md`: no `Co-Authored-By` or other AI attribution

Add rule 11 to the agent rules in `PLAN.md`: "Add your CHANGELOG line (see `CLAUDE.md`)". Don't copy the rules into `PLAN.md`.

### The check: `scripts/changelog.mjs`

No dependencies. Two modes:

- `node scripts/changelog.mjs --check-format`: structural checks on the file. Runs as part of `npm run check`.
  - there is a `## [Unreleased]` section and it comes first
  - section headings are only the six Keep a Changelog names
  - every entry line ends with a PR link whose number matches its URL
  - no PR number appears on two lines unless both are in the same PR's allowance (two lines maximum per PR)
  - released sections are `## [X.Y.Z] - YYYY-MM-DD`, newest first
- `node scripts/changelog.mjs --check-pr <number>`: passes if `[Unreleased]` has a line linking PR `<number>`. Runs in CI on `pull_request` events only, as its own step, and is skipped when the PR has the `no-changelog` label or its author is `dependabot[bot]`. Read the label and author from the event payload (`GITHUB_EVENT_PATH`), not from the API.

Add the `pull_request` types `labeled` and `unlabeled` to the workflow triggers so adding the label re-runs the check. Add the changelog step's outcome to the CI summary (ticket 17's Result table).

Create the `no-changelog` label (`gh label create`).

### Backfill

Add the missing entries under `[Unreleased]`, following the rules. As of 2026-11-14 these merged PRs have no entry: #7, #8, #19, #20, #23, #24, #25 (ticket PRs: *Added*, ticket title), #21 (Dependabot: one line under *Changed*) and #22 (only ticked owner checks: no entry). Re-check the list with `gh pr list --state merged` when starting, since more will have merged.

## Acceptance criteria

- [ ] `CLAUDE.md` exists with the CHANGELOG section; `PLAN.md` has rule 11 pointing to it.
- [ ] `scripts/changelog.mjs` has unit tests for each format rule (a passing file and one failing file per rule) and for `--check-pr` (entry present, entry missing, label present, Dependabot author).
- [ ] `npm run check` runs `--check-format`; CI runs `--check-pr` on pull requests and reports it in the summary.
- [ ] `CHANGELOG.md` has an entry for every merged PR that needs one, and passes `--check-format`.
- [ ] This ticket's own PR passes `--check-pr` with its own entry.
- [ ] (manual) A PR opened without an entry fails CI with a message that says which line to add and where; adding the `no-changelog` label turns it green.

## Out of scope

Generating entries from commit messages, release sections and version headings (20), rewriting existing entries.

## Handoff notes

_(Fill in: the script's exit codes and messages, and the function ticket 20 can reuse to read and rewrite sections.)_
