# Android dev setup on macOS (Capacitor 8, Boox Note Air 6C)

Researched 2026-11-12. Machine: Apple Silicon (`arm64`), macOS 27.2.1, Homebrew 7.0.13 present, no JDK (`/usr/bin/java` is only the macOS stub that errors), no Android SDK, no adb. Nothing was installed while researching. Items marked **unverified** could not be confirmed from a primary source.

## TL;DR recommendation

Use **Homebrew casks for two things only, plus the SDK Manager for everything else**. No Android Studio.

1. `brew install --cask temurin@21` : JDK 21 from Eclipse Adoptium (a .pkg, uninstallable).
2. `brew install --cask android-commandlinetools` : Google's official zip, sha256-pinned.
3. Use `sdkmanager` to install `platform-tools`, `platforms;android-36`, `build-tools;35.0.0`. Do **not** also install the `android-platform-tools` cask, to avoid two copies of adb.
4. Gradle is not installed at all; the project's `./gradlew` downloads 8.14.3 into `~/.gradle`.
5. Why casks and not manual downloads: I confirmed the cask download URLs are the vendor's own (`dl.google.com`, `github.com/adoptium`), and the cask sha256 for the command-line tools equals the SHA-256 Google publishes on developer.android.com. So you get vendor binaries, a pinned checksum, and one-command uninstall, without hand-moving directories. A fully Homebrew-free alternative is in section 6.

Studio (about 1.5 GB dmg) is only worth it if you want a GUI SDK manager, layout editor, or the Kotlin IDE for the later plugin tickets. It can be added later without conflict (point its SDK location at the same folder).

## 1. What this project actually needs (from `android/`)

| Item | Value | Source |
|---|---|---|
| Android Gradle Plugin | 8.13.0 | `android/build.gradle` |
| Gradle (wrapper) | 8.14.3 (`-all` distribution) | `android/gradle/wrapper/gradle-wrapper.properties` |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 | `android/variables.gradle` |
| Java source/target compat in Capacitor module | 21 | `node_modules/@capacitor/android/capacitor/build.gradle` |
| applicationId | `dev.personal.boox.screenplay` | `android/app/build.gradle` |
| Gradle heap | `-Xmx1536m` | `android/gradle.properties` |

Findings:
- **JDK: use 21.** AGP 8.13 needs JDK 17 minimum ([AGP 8.13 notes](https://developer.android.com/build/releases/agp-8-13-0-release-notes)), but Capacitor 8's Android module compiles with Java 21 (local file above), so 17 would fail. JDK 21 also satisfies AGP. That Gradle 8.14.3 runs on JDK 21 was not fetched from Gradle's compatibility matrix: **unverified** (it is widely true; confirm with the first build).
- **SDK components:** `platforms;android-36` (compileSdk), `build-tools` (AGP 8.13 minimum and default is 35.0.0, same release notes), `platform-tools` (adb), and `cmdline-tools;latest` (for sdkmanager). Max API supported by AGP 8.13 is 36.1.
- **Capacitor 8 docs say** a minimum of Android Studio 2025.2.1, that Studio auto-installs the JDK, and that you need an SDK platform for API 24 or greater ([Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)). Those docs mention nothing about command-line-only setups, so the CLI path here is derived from Google's tooling docs, not a Capacitor-endorsed recipe.
- **Licences:** each installed package needs its licence accepted: `sdkmanager --licenses` ([sdkmanager](https://developer.android.com/tools/sdkmanager)). Gradle may auto-download missing build-tools/platforms once licences are accepted (**unverified** here; installing explicitly avoids relying on it).
- **ANDROID_HOME:** Gradle must find the SDK via `ANDROID_HOME` / `ANDROID_SDK_ROOT` or `android/local.properties` (`sdk.dir=`). Setting ANDROID_HOME is the documented standard; the exact lookup order is **unverified** (not fetched).
- The `sdkmanager` page notes that `sdkmanager` is "deprecated" in favour of the new Android CLI (`android sdk ...`) ([source](https://developer.android.com/tools/sdkmanager)). `sdkmanager` still ships in the current command-line tools and is used below; the new CLI was not evaluated.

## 2. Comparison

| Option | Publisher / provenance | Installs where | Updates | Uninstall | Disk | Security notes |
|---|---|---|---|---|---|---|
| **A. Android Studio .dmg** (developer.android.com) | Google; current "Rabbit 2 / 2026.2.2 Patch 1", 1.5 GB dmg | `/Applications/Android Studio.app`; SDK default `~/Library/Android/sdk`; config in `~/Library/Application Support/Google/AndroidStudio*` | Self-updating in-app | Delete app + SDK + config dirs by hand | Several GB incl. SDK | Gatekeeper-checked app; Google publishes dmg SHA-256 (verified matches cask) |
| **B. Command-line tools zip + separate JDK** | Google (zip, 156.1 MB); JDK from Adoptium | Wherever you unpack; SDK layout must be `<sdk>/cmdline-tools/latest/` ([sdkmanager](https://developer.android.com/tools/sdkmanager)) | Manual (`sdkmanager --update`; re-download zip) | Delete the SDK folder; remove JDK pkg | About 1 to 2 GB with platform + build-tools (estimate) | Zip not code-signed in the macOS sense; verify SHA-256 |
| **C1. cask `android-studio`** | Homebrew/homebrew-cask; URL `edgedl.me.gvt1.com/android/studio/...` (a Google download host); sha256 pinned; `auto_updates true` | Same as A, plus symlink `studio` binary | App self-updates; brew defers (`auto_updates`) | `brew uninstall --cask`; `--zap` also deletes `~/.android` and `~/Library/Android/sdk` | As A | Pinned hash equals developer.android.com's (verified) |
| **C2. cask `android-commandlinetools`** | Homebrew/homebrew-cask; URL `dl.google.com/android/repository/commandlinetools-mac_arm64-15859902_latest.zip`; sha256 `835b62a2...` pinned; autobump | SDK root `/opt/homebrew/share/android-commandlinetools`; symlinks in `/opt/homebrew/bin` (sdkmanager, avdmanager, lint, r8, ...) | `brew upgrade` updates the tools only; SDK packages still via sdkmanager | `brew uninstall --cask` removes the tools; `--zap` removes the whole SDK root and `~/.android` | 156 MB + packages | Hash equals Google's published one (verified). Caveat prints "requires Java". Does not set ANDROID_HOME for you |
| **C3. cask `temurin@21`** | Homebrew/homebrew-cask; URL `github.com/adoptium/temurin21-binaries/...pkg`; sha256 pinned; currently 21.0.13+9 | `/Library/Java/JavaVirtualMachines/temurin-21.jdk` (pkg, needs admin password) | `brew upgrade` (livecheck uses the Adoptium API) | `brew uninstall --cask temurin@21` (pkgutil id `net.temurin.21.jdk`) | About 300 to 400 MB (estimate) | Pkg install runs as root; vendor pkg |
| **C4. cask `android-platform-tools`** | Homebrew/homebrew-cask; `dl.google.com/android/repository/platform-tools_r37.0.1-darwin.zip`; sha256 pinned | `/opt/homebrew/Caskroom/android-platform-tools/37.0.1`, symlinks adb, fastboot, ... | `brew upgrade` | `brew uninstall --cask` | Small | Redundant if sdkmanager installs `platform-tools` |
| **D. JDK alternatives** | Temurin pkg direct from adoptium.net; Android Studio's JBR; SDKMAN!/mise/asdf | Pkg: `/Library/Java/JavaVirtualMachines/`; managers: under `~` | per tool | per tool | | See below |

Cask definitions: [android-studio.rb](https://github.com/Homebrew/homebrew-cask/blob/HEAD/Casks/a/android-studio.rb), [android-commandlinetools.rb](https://github.com/Homebrew/homebrew-cask/blob/HEAD/Casks/a/android-commandlinetools.rb), [temurin@21.rb](https://github.com/Homebrew/homebrew-cask/blob/HEAD/Casks/t/temurin@21.rb), [android-platform-tools.rb](https://github.com/Homebrew/homebrew-cask/blob/HEAD/Casks/a/android-platform-tools.rb). Who maintains them: they live in the community-maintained `Homebrew/homebrew-cask` repo; individual maintainers were not checked (**unverified**). Versions above are as of today.

Cask semantics ([Cask Cookbook](https://docs.brew.sh/Cask-Cookbook)): `sha256` is the checksum of the file downloaded from `url`; `auto_updates true` means the app updates itself; `zap` is a more complete removal, performed only with `--zap`.

**JDK sources:**
- *Temurin pkg direct* vs *Homebrew cask*: identical binary and path; the cask adds a pinned hash and `brew upgrade`. Adoptium's page says the installer puts it in `/Library/Java/JavaVirtualMachines/temurin-<version>.jdk` and requires admin ([adoptium.net/installation/macOS](https://adoptium.net/installation/macOS/)).
- *Android Studio's JBR*: Google recommends it to run Studio, and for terminal Gradle `JAVA_HOME` decides the JDK ([Java versions in Android builds](https://developer.android.com/build/jdks)). Pointing `JAVA_HOME` at the bundled JBR works in principle, at `/Applications/Android Studio.app/Contents/jbr/Contents/Home` (path **unverified**, check it exists), and the JBR version in current Studio was not confirmed to be 21 (**unverified**). Only an option if you install Studio.
- *SDKMAN!/mise/asdf*: reasonable for multiple JDKs, but add another tool, shell hooks and their own download chain. Not needed for one JDK. Not researched in depth.

## 3. Verifying downloads

- **Android zips/dmg:** Google lists SHA-256 on [developer.android.com/studio](https://developer.android.com/studio) (cmdline-tools mac arm64 `835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e`, 156.1 MB; Studio arm dmg `06b79fc8f18f80c93fea008d078ce13b7f0a5e978e3e615f6acaffa0af5c6a6d`, 1.5 GB). Check with `shasum -a 256 <file>`. I compared these with the cask values and they match.
- **Homebrew:** downloads from `url`, compares to the `sha256` in the cask, and fails on mismatch (standard behaviour; the Cookbook page I fetched did not state the mismatch behaviour explicitly, so **unverified** in print). Inspect before installing: `brew cat --cask <name>` and `brew info --cask <name>`.
- **Adoptium:** cask pins `7c4cd71ec227fcff5e30d35816c2fe7d82ce2808b9ac6cc7adbd3272af3d9182` for the aarch64 21.0.13+9 pkg. Compare it with the checksum on the matching GitHub release asset page. The Adoptium signing/GPG documentation page (`/docs/signing/`) returned 404, so signature verification steps are **unverified**. After install: `pkgutil --check-signature <pkg>` works on the downloaded pkg (standard macOS tool; not checked against a primary source here).
- **Gatekeeper:** for software from outside the App Store it checks developer identity, Apple notarization and tamper status ([Apple Platform Security](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web)). `spctl -a -vv "/Applications/Android Studio.app"` shows the assessment (standard tool). Raw zips of command-line tools are CLI binaries, so rely on the checksum.

## 4. Apple Silicon

- Use the **aarch64** JDK (the cask picks it automatically via `arch arm:`); the cmdline-tools cask picks `mac_arm64`.
- The Android Emulator is optional: the real Boox is the target. Skip emulator and system images (a multi-GB download); `Capacitor` docs only require an emulator image if you choose that route ([Capacitor Android](https://capacitorjs.com/docs/android)). Note e-ink behaviour will not be reproduced by an emulator anyway.
- Gradle/AGP bring their own aarch64 tools; Rosetta is not required for this setup (not specifically verified for build-tools 35, **unverified**).

## 5. Device side (Boox Note Air 6C)

Official Android steps ([Run apps on a hardware device](https://developer.android.com/studio/run/device)): enable Developer options, then USB debugging; macOS needs no extra driver; the device shows an RSA fingerprint dialog on first connect that must be accepted. Wireless debugging needs Android 11+ and pairing with a six-digit code.

Boox specifics (no official Boox page found; this is from a third-party page, [SuperMirror Boox guide](https://supermirror-site.pages.dev/help/boox), so treat as **unverified**): Settings, About tablet, tap Build number 7 times (older firmware used the serial number). Developer options may reset after a firmware update. Boox's own help says to enable USB debugging and set USB mode to file transfer if the computer does not see the device ([Boox help](https://help.boox.com/hc/en-us/articles/360028371372)). Use a data-capable USB-C cable.

Commands:
```sh
adb devices                 # expect "<serial>  device"; "unauthorized" = accept the prompt on the tablet
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
# Wireless (Android 11+): on tablet Developer options > Wireless debugging > Pair with pairing code
adb pair <ip>:<pairing-port>        # enter 6-digit code
adb connect <ip>:<connect-port>     # port shown on the main Wireless debugging screen
```
Pair/connect syntax is from the standard adb docs (the fetched adb page was truncated, so the exact text is **unverified** here; the Studio flow above is verified).

Later tickets: the Onyx SDK is hosted on `https://repo.boox.com/repository/maven-public/` with group `com.onyx.android.sdk` according to community docs and the official OnyxAndroidDemo README as quoted by third parties; I found no official Boox documentation page (**unverified**). That repo must be added to `repositories {}` in the Gradle files. Boox "app optimisation" settings (per-app refresh modes, battery) and Google Play enablement are not needed for sideloaded debug builds; Boox-specific notes beyond the above are **unverified**.

## 6. Step-by-step

### Recommended: Homebrew casks (JDK + cmdline-tools) and sdkmanager

```sh
# 0. Inspect first (no install)
brew cat --cask temurin@21
brew cat --cask android-commandlinetools

# 1. JDK 21 (will ask for admin password for the pkg)
brew install --cask temurin@21

# 2. Command-line tools (puts SDK root at /opt/homebrew/share/android-commandlinetools)
brew install --cask android-commandlinetools
```
Add to `~/.zshrc` (you edit it yourself):
```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```
(`java_home` is a standard macOS tool; use of `-v 21` is not covered by the Adoptium page, so confirm output with the check below.) Then:
```sh
exec zsh
java -version                      # expect openjdk 21.0.x Temurin
sdkmanager --version
yes | sdkmanager --licenses        # or run interactively and read them
sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0"
sdkmanager --list_installed        # expect platform-tools, platforms;android-36, build-tools;35.0.0, cmdline-tools;latest
adb version
cd /Users/mgiordano/Repos/Personal/boox && npm run apk
ls android/app/build/outputs/apk/debug/app-debug.apk
```
The first `npm run apk` downloads Gradle 8.14.3 and Maven dependencies into `~/.gradle` (slow, large). If Gradle says "SDK location not found", create `android/local.properties` with `sdk.dir=/opt/homebrew/share/android-commandlinetools` (it is machine-specific; keep it git-ignored).

Gotcha: because Homebrew owns the SDK root, a `brew uninstall --zap` deletes the SDK and `~/.android` (the adb key, which is why the tablet will ask for authorisation again). Plain `uninstall` does not remove other installed SDK packages (inferred from the cask `zap` stanza; **unverified** by testing).

### Alternative: no Homebrew (manual downloads)

```sh
# JDK: download the macOS aarch64 JDK 21 .pkg from https://adoptium.net/temurin/releases/ , compare SHA-256, then:
shasum -a 256 ~/Downloads/OpenJDK21U-jdk_aarch64_mac_hotspot_*.pkg
sudo installer -pkg ~/Downloads/OpenJDK21U-jdk_aarch64_mac_hotspot_*.pkg -target /

# SDK: download the "Command line tools only" Mac arm64 zip from https://developer.android.com/studio#command-line-tools-only
shasum -a 256 ~/Downloads/commandlinetools-mac_arm64-*_latest.zip     # compare with developer.android.com
mkdir -p ~/Library/Android/sdk/cmdline-tools
unzip ~/Downloads/commandlinetools-mac_arm64-*_latest.zip -d ~/Library/Android/sdk/cmdline-tools
mv ~/Library/Android/sdk/cmdline-tools/cmdline-tools ~/Library/Android/sdk/cmdline-tools/latest
```
`~/.zshrc`: same as above but `ANDROID_HOME="$HOME/Library/Android/sdk"` and add `$ANDROID_HOME/cmdline-tools/latest/bin` to PATH. Then run the same `sdkmanager` and verification commands. Layout requirement is from the [sdkmanager docs](https://developer.android.com/tools/sdkmanager). Unzip into an empty scratch directory first if you want to inspect contents before moving them.

Android Studio variant: install the dmg (or `brew install --cask android-studio`), open once to let the wizard install the SDK to `~/Library/Android/sdk`; set `ANDROID_HOME` to that, and `JAVA_HOME` to a JDK 21.

## 7. Uninstall / cleanup (recommended path)

```sh
brew uninstall --cask android-commandlinetools   # tools only
brew uninstall --cask --zap android-commandlinetools   # also deletes the SDK root and ~/.android
brew uninstall --cask temurin@21                 # runs pkgutil forget for net.temurin.21.jdk
rm -rf ~/.gradle                                  # Gradle distributions + dependency cache (re-downloaded next build)
adb kill-server                                   # first, if adb is running
```
Remove the three `export` lines from `~/.zshrc`, and delete `android/local.properties` if you created it. If the JDK is still listed after uninstall, `/usr/libexec/java_home -V` shows it; the manual removal path per Adoptium's naming is `/Library/Java/JavaVirtualMachines/temurin-21.jdk` (`sudo rm -rf`; removal instructions are not on the Adoptium page, **unverified**). Studio, if later installed: delete the app plus `~/Library/Android/sdk` and `~/Library/Application Support/Google/AndroidStudio*` (as listed in the cask's zap stanza).

## Sources
- Capacitor 8 environment setup: https://capacitorjs.com/docs/getting-started/environment-setup
- Capacitor Android: https://capacitorjs.com/docs/android
- Java versions in Android builds: https://developer.android.com/build/jdks
- AGP 8.13 release notes: https://developer.android.com/build/releases/agp-8-13-0-release-notes
- Android Studio + command-line tools downloads and checksums: https://developer.android.com/studio
- sdkmanager: https://developer.android.com/tools/sdkmanager
- Run apps on a device / wireless debugging: https://developer.android.com/studio/run/device
- adb: https://developer.android.com/tools/adb
- Studio configuration: https://developer.android.com/studio/intro/studio-config
- Adoptium macOS install: https://adoptium.net/installation/macOS/
- Homebrew Cask Cookbook: https://docs.brew.sh/Cask-Cookbook
- Cask files: https://github.com/Homebrew/homebrew-cask/blob/HEAD/Casks/a/android-studio.rb , .../a/android-commandlinetools.rb , .../t/temurin@21.rb , .../a/android-platform-tools.rb
- Apple Gatekeeper: https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web
- Boox USB help: https://help.boox.com/hc/en-us/articles/360028371372
- Third-party Boox developer-mode guide (unverified): https://supermirror-site.pages.dev/help/boox
- Onyx SDK community docs (unverified): https://progressive-kiwi.github.io/onyx-inking-unofficial-docs/sdk-setup.html
