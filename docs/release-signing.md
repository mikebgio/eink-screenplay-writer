# Release signing

Release APKs are signed with one key that you create once. Android only installs an update over an existing app when both are signed with the same key, so this key is what lets each release install over the last one without losing the app's data.

> **Keep a backup of the keystore and its passwords outside this repo** (for example in your password manager, as an attachment). If the keystore is lost, no future release can install over the old ones: every Boox would have to uninstall the app, which deletes its private data (the recovery journal, recent files, and snapshots in single-file mode).

The keystore is never committed: `.gitignore` excludes `*.jks` and `*.keystore`.

## 1. Create the key

Needs JDK 21 (`keytool` comes with it). Run this outside the repo, for example in your home folder:

```bash
keytool -genkeypair -v \
  -keystore scriptwriter-release.jks \
  -alias scriptwriter \
  -keyalg RSA -keysize 4096 \
  -validity 36500 \
  -dname "CN=Scriptwriter"
```

`keytool` asks for a keystore password, then a key password (pressing Return reuses the keystore password). Validity is 100 years: the key must outlive every release.

Back up `scriptwriter-release.jks` and both passwords now.

## 2. Base64 it

GitHub secrets are text, so the keystore goes in as base64:

```bash
base64 -i scriptwriter-release.jks | tr -d '\n' > scriptwriter-release.jks.b64
```

## 3. Set the four repository secrets

From the repo folder (each command prompts for the value, so it doesn't land in your shell history), except the first, which reads the file:

```bash
gh secret set RELEASE_KEYSTORE_BASE64 < ~/scriptwriter-release.jks.b64
```

```bash
gh secret set RELEASE_KEYSTORE_PASSWORD
```

```bash
gh secret set RELEASE_KEY_ALIAS
```

(the alias is `scriptwriter` if you used the command above)

```bash
gh secret set RELEASE_KEY_PASSWORD
```

Then delete the `.b64` file: `rm ~/scriptwriter-release.jks.b64`.

The release workflow (`.github/workflows/release.yml`) decodes the keystore to a temporary file, passes its path to Gradle as `RELEASE_KEYSTORE_PATH`, and deletes it at the end of the run. If any secret is missing, the run fails and names the missing ones; it never falls back to a debug key.

## Building a release APK locally (optional)

```bash
export RELEASE_KEYSTORE_PATH=~/scriptwriter-release.jks
export RELEASE_KEY_ALIAS=scriptwriter
read -s RELEASE_KEYSTORE_PASSWORD && export RELEASE_KEYSTORE_PASSWORD
read -s RELEASE_KEY_PASSWORD && export RELEASE_KEY_PASSWORD
npm run apk:release
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. Without the variables, `assembleRelease` stops with a message listing them; `npm run apk` (debug) doesn't need them.

## The first release-signed install on the Boox

Builds so far were debug-signed, with a different key. Android won't install the first release-signed APK over a debug-signed one, so **once**:

1. In the app, save or export every script you care about, and note your workspace folder.
2. Uninstall Scriptwriter (this deletes the recovery journal, recent files and device-only snapshots).
3. Install `scriptwriter-vX.Y.Z.apk` from the release.

From then on, each release installs over the previous one and keeps the app's data.
