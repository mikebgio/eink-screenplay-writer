---
id: 20
title: Tag and release automation with packages
status: in-progress
blocked_by: [17, 19]
model: sonnet
plan: PLAN-2.md
---

# 20: Tag and release automation with packages

**Read first:** `PLAN-2.md` → Track A spec, stories 73–75, decisions D8, D9, D10; tickets 17 and 19 Handoff notes; `android/app/build.gradle`.

## What to build

Cutting a release becomes: run one command, merge the PR it produces. A workflow then tags the commit and publishes a GitHub Release with installable packages and notes from the CHANGELOG.

## Decisions

### One version (D8)

- `package.json` `version` is the only place the version is written.
- `android/app/build.gradle` reads it (`groovy.json.JsonSlurper` on `../../package.json`): `versionName` = the version string, `versionCode` = major × 10000 + minor × 100 + patch. Today that turns 0.1.0 into code 100, which is higher than the current hard-coded 1, so upgrades install.
- Show the version in the app: one line at the bottom of the start screen (`v0.1.0`), injected at build time with a Vite `define`.

### Preparing a release

`npm run release:prepare -- <patch|minor|major>` runs `scripts/release.mjs`, which:

1. refuses to run if the working tree is dirty or `[Unreleased]` is empty
2. lists merged PRs since the last tag that have no CHANGELOG line and no `no-changelog` label (via `gh pr list`); Dependabot PRs among them are folded into one *Changed* line, "Update dependencies", linking each; any other missing PR stops the script with the list
3. bumps `version` in `package.json` and `package-lock.json`
4. renames `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, adds a fresh empty `## [Unreleased]` above it, and rewrites the link references at the bottom (`[Unreleased]` → compare `vX.Y.Z...HEAD`; `[X.Y.Z]` → compare with the previous tag, or the tag itself for the first release)
5. prints the next steps (commit as `Release vX.Y.Z`, open the PR)

The script doesn't commit, push or open the PR itself. The release PR gets a CHANGELOG exemption: `changelog.mjs --check-pr` passes when the PR changes `version` in `package.json`.

### Publishing (`.github/workflows/release.yml`)

- Trigger: `push` to `main` that touches `package.json`, plus `workflow_dispatch` for retries.
- First step: read the version; if tag `vX.Y.Z` already exists, stop successfully (most pushes end here).
- `permissions: contents: write`, on this workflow only.
- Then: `npm ci`, `npm run check`, build the packages, create the tag on the pushed commit, and create the release with `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file …`, where the notes are that version's CHANGELOG section (reuse ticket 19's parser). Versions below 1.0.0 are marked as pre-releases.
- If any step fails, no tag and no release are left behind (create the tag and the release last, in one step).
- Write a run summary in the style of ticket 17: version, tag, package names, sizes and checksums, a link to the release.

### Packages (D10)

| File | What |
|---|---|
| `scriptwriter-vX.Y.Z.apk` | release build (`./gradlew assembleRelease`), signed with the release key |
| `scriptwriter-vX.Y.Z.apk.sha256` | checksum, in `sha256sum -c` format |
| `scriptwriter-web-vX.Y.Z.zip` | the `dist/` web build |

### Signing

- Add a `release` signing config to `android/app/build.gradle` that reads the keystore path and passwords from environment variables. With no variables set, `assembleRelease` fails with a message naming them; `assembleDebug` is unaffected.
- Secrets: `RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`. The workflow decodes the keystore to a temporary file and deletes it afterwards. Never echo the values.
- **The owner creates the key.** Write `docs/release-signing.md`: the `keytool` command, how to base64 it, the four `gh secret set` commands, and a plain warning that losing the keystore means future releases can't install over old ones, so keep a backup outside the repo. The keystore is never committed (add `*.jks` and `*.keystore` to `.gitignore`).
- Note in the doc: the first release-signed install replaces the debug-signed build on the Boox, which requires uninstalling the old app once. Export or save any script first.

### Docs

Add a *Releasing* section to `README.md` (the two steps) and a *Releases* rule to `CLAUDE.md`: never create tags or edit version numbers by hand; use `release:prepare`.

## Acceptance criteria

- [ ] `versionName` and `versionCode` come from `package.json`; a unit test covers the version-code formula in `scripts/release.mjs`, and the Gradle side is checked by reading the built APK's version in CI (`aapt dump badging` or the output metadata JSON).
- [ ] `scripts/release.mjs` has unit tests on fixture changelogs: section rename, new empty `[Unreleased]`, link references for a first and a second release, the empty-`[Unreleased]` refusal, and the Dependabot fold-in line.
- [ ] `release.yml` does nothing when the tag exists, and is lint-clean (`actionlint` if available; otherwise note it).
- [ ] `docs/release-signing.md`, the README *Releasing* section and the `CLAUDE.md` rule are written.
- [ ] (manual) The owner creates the keystore and sets the four secrets by following `docs/release-signing.md`.
- [ ] (manual) The first release PR (v0.1.0) is merged: tag `v0.1.0` exists, and the release has the three files and the CHANGELOG notes.
- [ ] (device) The APK from the release installs on the Boox, and the start screen shows the version.
- [ ] (device) A second release (v0.1.1) installs **over** the first without uninstalling, and recent files are still listed.

## Out of scope

Play Store or F-Droid publishing, an AAB, automatic version choice from commit messages, hosting the web build, in-app update prompts.

## Handoff notes

_(Fill in: the script's commands, the secret names as used, and what to do when a release run fails half-way.)_
