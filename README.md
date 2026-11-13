# Scriptwriter

E-ink screenplay editor for the Boox Note Air 6C. Edits plain-text Fountain files; TypeScript core wrapped in Capacitor for Android. See `SPEC.md` and `PLAN.md`.

## Prerequisites

- Node.js LTS and npm
- JDK 21 (Temurin 21 LTS, supported until at least Dec 2029). The Gradle daemon is pinned to Java 21 by `android/gradle/gradle-daemon-jvm.properties`, so a newer JDK on the machine can't take over the build. Gradle 8.14.3 doesn't support anything newer than Java 24. Move to the next LTS (25) only when Capacitor's Android template supports it. The pin is written by hand (`toolchainVersion=21`). Gradle's `updateDaemonJvm` task would need online JDK download sources, which we deliberately don't configure, so Gradle uses the locally installed JDK 21 and never downloads one.
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
npm test           # Vitest (engine tests)
npm run typecheck
npm run lint
```

## Build the APK

```bash
npm run apk        # build web app, cap sync, then gradle assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (debug-signed, fine for sideloading).

## Sideload

- With USB debugging on: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
- Or copy the APK to the Boox (USB or Google Drive) and open it there; allow installs from that app when asked.

## Layout

- `src/engine/` Script Engine: pure TypeScript, no DOM/Capacitor/I/O (enforced by `tsconfig.engine.json` and an ESLint rule)
- `src/storage/` Storage port (ticket 04)
- `src/platform/` Capacitor/native wrappers with browser fallbacks
- `src/ui/` Preact components
- `test/fixtures/`, `test/golden/` test inputs and expected outputs
- `assets/fonts/` Courier Prime (SIL OFL, licence included)
