---
id: 19
title: CHANGELOG rules and check
status: needs-device
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

- [x] `CLAUDE.md` exists with the CHANGELOG section; `PLAN.md` has rule 11 pointing to it.
- [x] `scripts/changelog.mjs` has unit tests for each format rule (a passing file and one failing file per rule) and for `--check-pr` (entry present, entry missing, label present, Dependabot author).
- [x] `npm run check` runs `--check-format`; CI runs `--check-pr` on pull requests and reports it in the summary.
- [x] `CHANGELOG.md` has an entry for every merged PR that needs one, and passes `--check-format`.
- [x] This ticket's own PR passes `--check-pr` with its own entry.
- [ ] (manual) A PR opened without an entry fails CI with a message that says which line to add and where; adding the `no-changelog` label turns it green.

## Out of scope

Generating entries from commit messages, release sections and version headings (20), rewriting existing entries.

## Handoff notes

**Built.** `CLAUDE.md` (project pointer, `npm run check`, no AI attribution, the seven D11 rules verbatim, a good and a bad example line). `PLAN.md` rule 11. `scripts/changelog.mjs` with `test/changelog.test.ts` (one passing fixture, one failing case per rule, the real `CHANGELOG.md`, and `--check-pr` cases). `npm run check` ends with `node scripts/changelog.mjs --check-format`. In `main.yml`: step `changelog` (format, mirrors `check`) and step `changelog_pr` (PR events only, `if: !cancelled()` so it reports even when a check above failed); both outcomes are rows in the summary's Result table (the PR row is hidden on pushes). `pull_request` now also triggers on `labeled` and `unlabeled`.

**Commands, exit codes and messages:**

- `node scripts/changelog.mjs --check-format [file]`: exit 0 "CHANGELOG.md format OK."; exit 1 with one `line N: …` per problem (missing or misplaced `[Unreleased]`, a `###` name outside the six, an entry without a trailing PR link, a link whose text number differs from its URL or points at another repo, a PR on more than two lines, a malformed release heading, releases not newest first, an entry outside any `###`).
- `node scripts/changelog.mjs --check-pr <n>`: reads `GITHUB_EVENT_PATH` if set. Exit 0 when `[Unreleased]` has an entry whose trailing links include #n, or the PR has the `no-changelog` label, or the author is `dependabot[bot]`. Exit 1 with a message naming the PR, where to add the line, an example line built from the PR title (a leading `NN: ` ticket number is dropped), and the label alternative.
- Exit 2: usage error (unknown mode, PR number not a positive integer).

An entry line may link several PRs (`([#21](…), [#30](…))`): the Dependabot fold-in line from ticket 20 uses this, and each linked PR counts towards its two-line limit.

**For ticket 20:** `parseChangelog(text)` returns `{ lines, releases, linksStart }`; each release has `name` (`Unreleased` or `X.Y.Z`), `date`, `heading`, `index` (heading line) and `end` (exclusive), `groups` (`{ name, index, entries }`) and entries (`{ text, index, prs }`). `linksStart` is the first link-reference line at the bottom. Line indexes are 0-based into `lines`, so a rewrite is slicing `lines` and joining with `\n`. Constants: `REPO_URL`, `GROUPS` (Keep a Changelog order), `NO_CHANGELOG_LABEL`, `DEPENDABOT`.

**Backfill.** Added lines for #7, #8, #19, #20, #23, #24, #25, #27 and #28 (ticket titles), plus #9 ("Add Dependabot, CI workflow and CHANGELOG", which the ticket's list missed; without a line or a label the release script would stop on it). #21 (Dependabot) has a *Changed* line. #22 and #26 (tickets and plans only) need no line, but need the `no-changelog` label, or `release:prepare` will list them as missing.

**This PR's entry** is written for PR **#29**, the next free number when this was committed (highest PR was #28, no issues). If GitHub gives the PR another number, change the `#29` link in `CHANGELOG.md` (two lines) before merging.

**Owner checks:**

- (manual) Create the label and label the two PRs that need no entry:
  - `gh label create no-changelog --description "PR needs no CHANGELOG entry" --color ededed`
  - `gh pr edit 22 --add-label no-changelog`
  - `gh pr edit 26 --add-label no-changelog`
- (manual) Open a PR with no entry: CI fails with the message above; adding `no-changelog` re-runs CI and turns it green.

**After review (PR #29):**

- The PR check moved out of the `ci` job into its own workflow, `.github/workflows/changelog.yml` (job `changelog`): checkout, setup-node, one step, no install. Adding or removing the `no-changelog` label now re-runs only that job, not the whole build, and no longer cancels a running CI build. Its result is the job's own run summary, not a row in the CI summary; `ci` no longer triggers on `labeled`/`unlabeled`. **For ticket 18:** make `changelog` a required status check next to `ci`.
- The release-PR exemption is narrower: a PR that changes `version` passes without an entry only when `CHANGELOG.md` also has a dated `## [X.Y.Z]` section for the new version (only `release:prepare` writes one). A feature PR that bumps the version still needs its line, and the failure message says to use `release:prepare`.
- The trailing link list no longer accepts a dangling `, ` before the closing parenthesis.
