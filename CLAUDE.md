# Scriptwriter

An e-ink screenplay editor for the Boox Note Air 6C: Preact + CodeMirror, wrapped in Capacitor for Android, editing plain Fountain files. What it does: [SPEC.md](SPEC.md). The work, ticket by ticket: [PLAN.md](PLAN.md) (Phase 1) and [PLAN-2.md](PLAN-2.md) (Plan 2). Follow the agent rules in `PLAN.md`.

- Run `npm run check` before finishing. It runs what CI runs: typecheck, lint, tests, the plan check and the CHANGELOG format check.
- No `Co-Authored-By` lines or any other AI attribution, in commits, PR descriptions or the CHANGELOG.

## Releases

Never create tags or edit version numbers by hand. Use `npm run release:prepare -- <patch|minor|major>` and open the PR it prepares; merging it publishes the release (see *Releasing* in `README.md`).

## CHANGELOG

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). CI fails a PR that has no line for it (`scripts/changelog.mjs`).

1. Every PR adds exactly one line under `## [Unreleased]`, in the right Keep a Changelog section (Added, Changed, Deprecated, Removed, Fixed, Security). A PR that truly does two unrelated things may add two.
2. Write for the person using the app or the repo, not for the code: say what is different now. One sentence, starting with a capital, no trailing full stop. A ticket PR's line under *Added* is the ticket title.
3. End the line with the PR link: `([#N](https://github.com/mikebgio/eink-screenplay-writer/pull/N))`. Open the PR first to get the number, then add the line and push.
4. Add new lines at the bottom of their section. Never reorder, reword or delete someone else's line, and never edit a released section.
5. No entry is needed when the PR only changes tickets, plan documents or comments, or only ticks owner-check criteria. Give such a PR the `no-changelog` label. Dependabot PRs are exempt automatically; the release script adds one "Update dependencies" line that links them.
6. Don't touch version numbers, dated section headings or the link references at the bottom of the file. `npm run release:prepare` owns those.
7. No AI attribution in entries.

Good (says what changed for the writer):

```
- Scenes can be exported as PDF from the share menu ([#28](https://github.com/mikebgio/eink-screenplay-writer/pull/28))
```

Bad (describes the code, not the outcome; ends with a full stop):

```
- Add exportPdf() to src/engine and wire it into ExportDialog.tsx ([#28](https://github.com/mikebgio/eink-screenplay-writer/pull/28)).
```
