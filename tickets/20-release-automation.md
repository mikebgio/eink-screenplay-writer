---
id: 20
title: Tag and release automation with packages
status: needs-device
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

- [x] `versionName` and `versionCode` come from `package.json`; a unit test covers the version-code formula in `scripts/release.mjs`, and the Gradle side is checked by reading the built APK's version in CI (`aapt dump badging` or the output metadata JSON).
- [x] `scripts/release.mjs` has unit tests on fixture changelogs: section rename, new empty `[Unreleased]`, link references for a first and a second release, the empty-`[Unreleased]` refusal, and the Dependabot fold-in line.
- [x] `release.yml` does nothing when the tag exists, and is lint-clean (`actionlint` if available; otherwise note it).
- [x] `docs/release-signing.md`, the README *Releasing* section and the `CLAUDE.md` rule are written.
- [ ] (manual) The owner creates the keystore and sets the four secrets by following `docs/release-signing.md`.
- [ ] (manual) The first release PR (v0.1.0) is merged: tag `v0.1.0` exists, and the release has the three files and the CHANGELOG notes.
- [ ] (device) The APK from the release installs on the Boox, and the start screen shows the version.
- [ ] (device) A second release (v0.1.1) installs **over** the first without uninstalling, and recent files are still listed.

## Out of scope

Play Store or F-Droid publishing, an AAB, automatic version choice from commit messages, hosting the web build, in-app update prompts.

## Handoff notes

**Built.**

- **Version (D8):** `android/app/build.gradle` reads `version` from `../../package.json` with `JsonSlurper`; `versionName` is the string, `versionCode` = major × 10000 + minor × 100 + patch (0.1.0 → 100). Gradle refuses a version that isn't `X.Y.Z` or has minor/patch ≥ 100 (codes would collide); `versionCode()` in `scripts/release.mjs` does the same and is unit-tested. CI step `apk_version` runs `node scripts/release.mjs --verify-apk …/debug/output-metadata.json` after the debug build and fails on a mismatch; the summary's Package section shows `versionName (versionCode N)` from that file.
- **Start screen:** `v0.1.0` at the bottom (`.app-version`), from `__APP_VERSION__`, a Vite `define` in `vite.config.ts` (declared in `src/appVersion.d.ts`).
- **`npm run release:prepare -- <patch|minor|major>`** (`scripts/release.mjs`): refuses a dirty tree or an empty `[Unreleased]`; lists PRs merged into `main` after the last `v*` tag's commit date (`gh pr list --state merged`) that no CHANGELOG line links and that have no `no-changelog` label, skipping PRs titled `Release vX.Y.Z`; Dependabot PRs (`app/dependabot` or `dependabot[bot]`) become one *Changed* line, "Update dependencies", linking each; any other missing PR stops it with the list. Then `npm version X.Y.Z --no-git-tag-version` (package.json and package-lock.json), rewrites `CHANGELOG.md` and prints the next steps. It doesn't commit, push or open the PR.
- **Other modes:** `--verify-apk <output-metadata.json>` (CI and release), `--summary <dir> <version> <url>` (release run summary). `node scripts/changelog.mjs --notes X.Y.Z` prints a section's body (release notes), via `sectionBody()`.
- **Release PR exemption:** `changelog.mjs --check-pr` passes when the PR changes `version` in package.json. The CI step fetches the payload's `pull_request.base.sha` (depth 1) and the script compares that commit's `package.json` with the checked-out one. If the fetch fails it falls back to the normal check.
- **`.github/workflows/release.yml`:** on push to `main` touching `package.json`, or `workflow_dispatch` (main only). Step `version` reads the version (failing unless it is `X.Y.Z`) and stops the run successfully (every other step skipped, a line in the summary) if tag `vX.Y.Z` exists (`gh api repos/…/git/ref/tags/vX.Y.Z`) **or** `CHANGELOG.md` has no `## [X.Y.Z]` section. The second condition is an addition to the ticket: without it, merging this PR (which edits `package.json` at the untagged 0.1.0) and any npm Dependabot PR before the first release would start a release run that fails red. Only `release:prepare` writes a dated section, so "no section" means "not a release commit". Otherwise: `npm ci`, `npm run check`, `npm run android` (no secrets), then one step that checks the four secrets (failing with the names of any missing), decodes the keystore to `$RUNNER_TEMP/release.jks`, runs `./gradlew assembleRelease` and deletes the keystore on exit (together these equal `npm run apk:release`; this is the only step with the signing variables), delete the keystore again (`if: always()`, a backstop), verify the APK version, `apksigner verify --print-certs` the APK (its log shows the certificate digest), package, then **one** `gh release create vX.Y.Z … --target $GITHUB_SHA` that creates the tag and the release together (`--prerelease` below 1.0.0), then the summary. `permissions: contents: write` is on this workflow only; the checkout uses `persist-credentials: false` so `npm ci` and Gradle (which run in the same job) never see the write token, which goes only to the tag check and the publish step as `GH_TOKEN`. `concurrency: release`, never cancelled. The keystore secrets are only in the Gradle step's environment; splitting signing into a separate job wasn't worth an extra artifact hand-off for a one-person repo.
- **Packages:** `scriptwriter-vX.Y.Z.apk` (from `app-release.apk`), `scriptwriter-vX.Y.Z.apk.sha256` (`sha256sum` output, so `sha256sum -c` works), `scriptwriter-web-vX.Y.Z.zip` (contents of `dist/`).
- **Signing:** `signingConfigs.release` in `build.gradle` reads `RELEASE_KEYSTORE_PATH`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`. Task `checkReleaseSigning` runs before `preReleaseBuild` and fails naming the missing variables; debug builds don't depend on it. If a future Android Gradle Plugin renamed `preReleaseBuild`, the check would silently stop running, but the release still can't ship unsigned: AGP names an unsigned build `app-release-unsigned.apk`, so the Package step's copy fails, and `apksigner verify` runs first anyway. A later improvement: pin the expected certificate SHA-256 and compare it in that step. Repository secrets: `RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` (the workflow turns the first into the file path). `*.jks` and `*.keystore` were already in `.gitignore`.
- **Docs:** `docs/release-signing.md`, *Releasing* in `README.md`, *Releases* in `CLAUDE.md`.

**Not verified locally:** no JDK on the dev Mac, so the Gradle changes (version from package.json, signing config, `checkReleaseSigning`) have not been compiled. This PR's CI run is the first check: its `apk` and `apk_version` steps must pass with `versionName 0.1.0 (versionCode 100)`. `actionlint` isn't installed; both workflows were parsed as YAML (Ruby) and reviewed by hand. `release.yml` has never run.

**When a release run fails half-way:** nothing is tagged or published, because the tag and the release are created together in the last step. Fix the cause with a normal PR to `main` (if the fix changes `package.json`, the push re-triggers the workflow by itself), or re-run with *Actions → Release → Run workflow* on `main`. If `gh release create` itself failed after creating a draft or a tag (rare), delete them (`gh release delete vX.Y.Z --cleanup-tag`) before re-running. Don't bump the version to work around a failed run.

**Before the first release:** label #22 and #26 `no-changelog` (ticket 19's owner checks), or `release:prepare` stops on them.

**Owner checks:**

- (manual) Create the keystore and set the four secrets by following `docs/release-signing.md`.
- (manual) Cut the first release (see the open question below for which version), merge its PR, and check: the tag exists, and the release has the three files and the CHANGELOG notes.
- (device) The release APK installs on the Boox (uninstall the debug build once first; see the doc) and the start screen shows `v0.1.0`.
- (device) v0.1.1 installs **over** v0.1.0 without uninstalling, and recent files are still listed.

**Open question for the owner (first release):** the ticket's criterion says "the first release PR (v0.1.0)", but `package.json` is already 0.1.0 and `release:prepare` always bumps. Two ways: (a) run `npm run release:prepare -- patch` and make the first release v0.1.1 (simplest; nothing else changes); or (b) for v0.1.0, hand-edit one PR that renames `[Unreleased]` to `## [0.1.0] - <date>` and fixes the link references, which breaks the "never by hand" rule once; merging it releases v0.1.0. I recommend (a). The (device) checks then read v0.1.1 for the first release and v0.1.2 for the second.
