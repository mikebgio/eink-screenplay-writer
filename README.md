# Scriptwriter

E-ink screenplay editor for the Boox Note Air 6C. Edits plain-text Fountain files; TypeScript core wrapped in Capacitor for Android. See `SPEC.md` and `PLAN.md`.

## Prerequisites

- Node.js LTS and npm
- JDK 21 (Temurin 21 LTS). The Gradle daemon is pinned to Java 21 by `android/gradle/gradle-daemon-jvm.properties` and never downloads a JDK, so if Gradle can't find a local JDK 21 the build fails. See [JDK pin](docs/android-dev-setup-macos.md#jdk-pin) for why, and the fix.
- Android SDK command-line tools, with `ANDROID_HOME` set: `platforms;android-36`, `build-tools;35.0.0`, `platform-tools` (for `adb`)

**Full setup guide:** [docs/android-dev-setup-macos.md](docs/android-dev-setup-macos.md). It covers where each tool comes from, how to check downloads, a setup without Homebrew, Boox USB debugging, and uninstalling. The recommended path, in short:

```bash
brew info --cask --json=v2 temurin@21 | grep -E '"(url|sha256|version)"'   # check source + checksum first
brew info --cask --json=v2 android-commandlinetools | grep -E '"(url|sha256|version)"'
brew install --cask temurin@21
brew install --cask android-commandlinetools
```

Add to `~/.zshrc`:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

Then:

```bash
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0"
```

## Develop

```bash
npm install
npm run dev        # editor + print view in a desktop browser
npm run check      # everything CI checks: typecheck, lint, tests, plan up to date, CHANGELOG format
npm test           # Vitest only
```

Run `npm run check` before pushing. CI runs the same checks (as separate steps, so each shows its own result), builds the APK and writes a summary on the run page.

## Contributing

The gate on `main` is in force: changes arrive only through pull requests, and a PR can merge only when its `ci` and `changelog` checks have passed. Merges are squash merges only. Dependabot PRs go through the same gate.

1. Run `npm run check` before pushing.
2. Open a PR against `main` and add its CHANGELOG line (see `CLAUDE.md`).
3. When `ci` is green, squash-merge.

The gate is kept in the repo as `.github/rulesets/main.json`. The owner applies it with `scripts/apply-ruleset.sh`.

## Build the APK

```bash
npm run apk        # build web app, cap sync, then gradle assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (debug-signed, fine for sideloading).

## Releasing

1. On an up-to-date `main` with a clean tree: `npm run release:prepare -- patch` (or `minor`, `major`). It bumps the version in `package.json`, turns `[Unreleased]` in `CHANGELOG.md` into a dated section, and stops if a merged PR has no CHANGELOG line (add the line, or label the PR `no-changelog`). Commit as `Release vX.Y.Z` on a branch and open a PR.
2. Merge the PR. The release workflow tags the commit `vX.Y.Z` and publishes a GitHub Release with the signed APK, its SHA-256 file and a zip of the web build, with that version's CHANGELOG section as the notes.

Never create tags or edit the version by hand. Signing setup (once): [docs/release-signing.md](docs/release-signing.md). If a release run fails, fix the cause on `main` and re-run it from the Actions tab (*Release* → *Run workflow*); it builds again and only tags when everything has passed.

## Sideload

- With USB debugging on: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
- Or copy the APK to the Boox (USB or Google Drive) and open it there; allow installs from that app when asked.

## E-ink refresh

The app switches the Onyx screen refresh itself: fast while you type, then a full clean refresh after 1.5 s idle, on page turns and when a drawer or dialog opens or closes (`src/platform/refreshPolicy.ts`, native side `EInkPlugin.kt`). Everything is a no-op off Onyx hardware and in a browser.

Manual fallback: the Boox system has its own per-app refresh settings (app optimisation menu, per app). You can set a refresh mode there if the plugin misbehaves; the app does not depend on it.

Typing latency: press `Ctrl+Shift+D` (or long-press the document name) for the debug panel; see `docs/latency-test.md` for the filmed test and `docs/decisions/0001-editor-surface.md` for the GO/NO-GO record.

## Sync conflicts

The app never writes over a script that changed since it last read or wrote it. If you have unsaved edits it shows both versions (**Keep mine**, **Take theirs**, **Keep both**) and saves a `pre-conflict` snapshot of each before applying your choice; with no unsaved edits it just loads the new version.

**Limitation:** the app only sees what the Drive app has already synced to the device. If Drive hasn't synced yet, an edit made on another device can't be detected, and Drive may later keep either version or both. The snapshots taken before resolving are the safety net, so check the Snapshots panel if something looks missing. Sync on both devices before switching between them.

## Layout

- `src/engine/` Script Engine: pure TypeScript, no DOM/Capacitor/I/O (enforced by `tsconfig.engine.json` and an ESLint rule)
- `src/storage/` Storage port (ticket 04)
- `src/platform/` Capacitor/native wrappers with browser fallbacks
- `src/ui/` Preact components
- `test/fixtures/`, `test/golden/` test inputs and expected outputs
- `assets/fonts/` Courier Prime (SIL OFL, licence included)
