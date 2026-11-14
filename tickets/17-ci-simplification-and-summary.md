---
id: 17
title: Simpler CI with a readable run summary
status: todo
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

- [ ] `npm run check` exists and runs typecheck, lint, tests and the plan check; `PLAN.md` rule 5 and `README.md` name it.
- [ ] The workflow has exactly one job, `ci`; dependencies are installed once and the web app is built once per run.
- [ ] `scripts/ci-summary.mjs` has unit tests for its rendering: all passing, a failed test (names listed), lint problems, and "not run" when a result file is missing.
- [ ] A CI run on this ticket's PR shows the five summary sections on the run page (paste the rendered summary into Handoff notes).
- [ ] A deliberately failing test pushed to the PR branch (then reverted) produces a red run whose summary names the test, and an annotation on the diff.
- [ ] The run is no slower than before (record the before and after durations in Handoff notes).

## Out of scope

The required status check (18), the changelog check (19), release builds (20), a matrix of Node or Android versions, code coverage.

## Handoff notes

_(Fill in: the step ids, which removed steps had to stay, run durations, and how later tickets add a check to both `npm run check` and the workflow.)_
