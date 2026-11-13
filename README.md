# Scriptwriter

E-ink screenplay editor for the Boox Note Air 6C. Edits plain-text Fountain files; TypeScript core wrapped in Capacitor for Android. See `SPEC.md` and `PLAN.md`.

## Prerequisites

- Node.js LTS and npm
- JDK 21 (`java -version` must work)
- Android SDK command-line tools, with `ANDROID_HOME` set (platform 35 or newer, build-tools, platform-tools for `adb`)

On macOS with Homebrew:

```bash
brew install --cask temurin@21
brew install --cask android-commandlinetools
export ANDROID_HOME="$HOME/Library/Android/sdk"   # add to ~/.zshrc
mkdir -p "$ANDROID_HOME"
sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --sdk_root="$ANDROID_HOME" --licenses
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
