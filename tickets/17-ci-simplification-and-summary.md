---
id: 17
title: Simpler CI with a readable run summary
status: needs-device
blocked_by: []
model: sonnet
plan: PLAN-2.md
---

# 17: Simpler CI with a readable run summary

**Read first:** `PLAN-2.md` → Track A spec, stories 68, 69, 71, decisions D5, D6; `.github/workflows/main.yml`.

## What to build

Collapse CI into one job that runs one check command, and make every run write a summary a person can read on the run page.

## Decisions

### One command for the checks

Add to `package.json`:

```json
"check": "npm run typecheck && npm run lint && npm test && node scripts/plan.mjs --check"
```

Update agent rule 5 in `PLAN.md` and the *Develop* section of `README.md` to say `npm run check`.

### One job

Replace the `web` and `android` jobs in `.github/workflows/main.yml` with a single job with the id and name **`ci`** (ticket 18 requires this exact name). Steps, in order:

1. checkout
2. setup-node (LTS, npm cache)
3. setup-java (Temurin 21, Gradle cache)
4. `npm ci`
5. `npm run check`
6. `npm run apk` (this already builds the web app, so there is no separate `npm run build` step)
7. upload `app-debug.apk` as an artifact
8. write the summary (`if: always()`)

Keep: the triggers, `permissions: contents: read`, the concurrency block, and every action pinned to a commit SHA with its version comment.

Remove, unless a run proves they are needed:

- The "Check Java version" step. `setup-java` already puts JDK 21 first; if Gradle can't find it the build fails with the message documented in `docs/android-dev-setup-macos.md`.
- The "Install Android SDK packages if missing" step. First check a run's log on `ubuntu-latest`: if `platforms;android-36` and `build-tools;35.0.0` are preinstalled, delete the step; if not, keep it and say so in Handoff notes.

Add `timeout-minutes: 20` to the job.

### The summary

Write `scripts/ci-summary.mjs` (no dependencies, like `plan.mjs`). It prints Markdown to stdout; the workflow appends it to `$GITHUB_STEP_SUMMARY`. It must work when earlier steps failed, showing what it has and marking the rest "not run".

Sections:

| Section | Content | Source |
|---|---|---|
| Result | one line per check (typecheck, lint, tests, plan, APK): ✅ / ❌ / not run | step outcomes passed in as environment variables (`steps.<id>.outcome`) |
| Tests | files, tests passed / failed / skipped, duration; the names of failed tests | Vitest JSON reporter output (`vitest run --reporter=default --reporter=json --outputFile=…`) |
| Lint | error and warning counts; the first 10 problems as `file:line rule` | `eslint . -f json -o …` |
| Package | APK file name, size in MB, SHA-256, `versionName` | the built file and `package.json` |
| Plan | progress line for each plan document and the `--next` list | `node scripts/plan.mjs --next` and the progress lines in `PLAN*.md` |

To get separate outcomes without duplicating work, the workflow runs the four parts of `check` as separate steps with ids (each calling the same npm script that `check` chains), with `if: always()` only on the summary. `npm run check` stays the local equivalent; add a comment in the workflow saying the two must list the same checks.

Also turn on Vitest's `github-actions` reporter in CI so failed tests appear as annotations on the PR diff.

## Acceptance criteria

- [x] `npm run check` exists and runs typecheck, lint, tests and the plan check; `PLAN.md` rule 5 and `README.md` name it.
- [x] The workflow has exactly one job, `ci`; dependencies are installed once and the web app is built once per run.
- [x] `scripts/ci-summary.mjs` has unit tests for its rendering: all passing, a failed test (names listed), lint problems, and "not run" when a result file is missing.
- [ ] A CI run on this ticket's PR shows the five summary sections on the run page (paste the rendered summary into Handoff notes).
- [ ] A deliberately failing test pushed to the PR branch (then reverted) produces a red run whose summary names the test, and an annotation on the diff.
- [x] The run is no slower than before (record the before and after durations in Handoff notes).

## Out of scope

The required status check (18), the changelog check (19), release builds (20), a matrix of Node or Android versions, code coverage.

## Handoff notes

**Built.** `npm run check` in `package.json`; one job `ci` in `.github/workflows/main.yml`; `scripts/ci-summary.mjs` (pure render functions exported for `test/ciSummary.test.ts`; the CLI part only runs when the file is executed). `tsconfig.json` now has `allowJs: true` so tests can import the `.mjs` scripts and get inferred types (`checkJs` stays off). `reports/` (the JSON reports CI writes) is git-ignored.

**Step ids:** `typecheck`, `lint`, `tests`, `plan`, `apk`, then the upload and the `Summary` step (`if: always()`). Each id's `steps.<id>.outcome` is passed to the summary as `OUTCOME_<ID>`. Anything other than `success`/`failure` (a step skipped because an earlier one failed, or a step that didn't exist) shows as "not run".

- `lint` runs `npm run lint -- --format json --output-file reports/eslint.json`, so the log shows no stylish output; the problems are in the summary's Lint section.
- `tests` runs `npm test -- --reporter=default --reporter=github-actions --reporter=json --outputFile.json=reports/vitest.json`. Vitest drops its automatic `github-actions` reporter once reporters are given on the command line, so it's listed explicitly.

**Removed steps.** "Check Java version": removed, as the ticket says. "Install Android SDK packages if missing": removed. The log of run 43647719368 (main, 2026-11-14, image ubuntu-26.04 20261111) shows the step finished in under a second with no `sdkmanager` output, so `platforms;android-36` and `build-tools;35.0.0` were already installed. If a future runner image drops them, Gradle fails with "Failed to find target android-36"; put the step back then.

**Durations, before:** run 43647719368 took 2 min 27 s wall-clock (job `web` 1 min 15 s, then job `android` 1 min 7 s, each with its own checkout, setup-node and `npm ci`; the web app was built in both). After: fill in from this PR's first run.

**Adding a check later (tickets 19, 20 and beyond):** add it to `check` in `package.json`; add a step with an `id` to `main.yml` in the same place in the order; pass its outcome to the `Summary` step as `OUTCOME_<ID>`; add a row to `CHECKS` in `scripts/ci-summary.mjs` (`optional: true` hides the row when the step didn't run, for PR-only checks). The comment above the check steps in `main.yml` says this.

**Not run locally:** the workflow itself (no `actionlint` on the dev Mac) and the APK build (no JDK). The summary script was run locally against real Vitest and ESLint reports.

**Owner checks** (need a CI run on this PR, which the sandbox can't push):

- (manual) The run page of this PR shows the five summary sections. Paste the rendered summary here.
- (manual) Push a deliberately failing test to the PR branch, check the run is red, the summary names the test and the diff shows an annotation; then revert it.
- (manual) Done: 2 min 9 s (see below).

**After review (PR #29):**

- The check steps and the APK build run with `if: !cancelled() && steps.install.outcome == 'success'`, so a failing check no longer hides the later checks' results; the job still fails. `apk_version` and the upload run only when the APK built.
- The Lint section shows each problem's message (`file:line rule: message`), since the lint step's log has only JSON.
- `/reports/` and `/release-files/` are anchored in `.gitignore`.
- Dependency caching: npm is cached by `setup-node` (`~/.npm`; the first run on this PR hit it and `npm ci` took 5 s). Gradle moved from `setup-java`'s `cache: gradle` to `gradle/actions/setup-gradle` (`cache-provider: basic`, the open-source GitHub Actions cache, not the default commercial one; its job summary off). `setup-java` keys on an exact hash of the `*.gradle` files, so this PR's first run, which changed `build.gradle`, missed and re-downloaded every Gradle dependency; `setup-gradle` restores the closest entry instead. Its entries are written only by runs on `main`; PR runs read them.
- First run on this PR (run 43655728445, before these changes): 2 min 9 s wall-clock, against 2 min 27 s before.
