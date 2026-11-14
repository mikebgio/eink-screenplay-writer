# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Minimal working app on the tablet ([#1](https://github.com/mikebgio/eink-screenplay-writer/pull/1))
- Open, save, autosave and recovery ([#5](https://github.com/mikebgio/eink-screenplay-writer/pull/5))
- Recognise every screenplay element ([#6](https://github.com/mikebgio/eink-screenplay-writer/pull/6))
- Variable Drawer ([#7](https://github.com/mikebgio/eink-screenplay-writer/pull/7))
- Paged print view with basic page breaks ([#8](https://github.com/mikebgio/eink-screenplay-writer/pull/8))
- Dependabot updates, a CI build on every pull request, and this changelog ([#9](https://github.com/mikebgio/eink-screenplay-writer/pull/9))
- Snapshots and comparing drafts ([#19](https://github.com/mikebgio/eink-screenplay-writer/pull/19))
- Writing tools ([#20](https://github.com/mikebgio/eink-screenplay-writer/pull/20))
- Typing-speed test and screen refresh control ([#23](https://github.com/mikebgio/eink-screenplay-writer/pull/23))
- Industry page-break rules ([#24](https://github.com/mikebgio/eink-screenplay-writer/pull/24))
- Keyboard-first editing ([#25](https://github.com/mikebgio/eink-screenplay-writer/pull/25))
- FDX and Fountain exchange ([#27](https://github.com/mikebgio/eink-screenplay-writer/pull/27))
- PDF export ([#28](https://github.com/mikebgio/eink-screenplay-writer/pull/28))
- Simpler CI with a readable run summary, and a check that every pull request adds a CHANGELOG line ([#29](https://github.com/mikebgio/eink-screenplay-writer/pull/29))
- Tag and release automation with packages: merging a release PR publishes a signed APK and a web build, and the start screen shows the version ([#29](https://github.com/mikebgio/eink-screenplay-writer/pull/29))

### Changed

- Pin the Gradle daemon to JDK 21 ([#2](https://github.com/mikebgio/eink-screenplay-writer/pull/2))
- Group Dependabot updates into one weekly PR per ecosystem, hold new releases for 14 days, and pin GitHub Actions to commit SHAs ([#18](https://github.com/mikebgio/eink-screenplay-writer/pull/18))
- Bump actions/checkout to v7, actions/setup-node to v7, actions/setup-java to v6, actions/upload-artifact to v7, and androidx.documentfile to 1.1.0 ([#18](https://github.com/mikebgio/eink-screenplay-writer/pull/18))
- Update the Gradle wrapper to 8.14.6 ([#21](https://github.com/mikebgio/eink-screenplay-writer/pull/21))

### Fixed

- Fix the gradlew path and first-download note in the JDK pin docs, and document the failure mode ([#3](https://github.com/mikebgio/eink-screenplay-writer/pull/3))
- Fix flaky storage tests by making `MemoryStorage` hashing synchronous ([#10](https://github.com/mikebgio/eink-screenplay-writer/pull/10))

[Unreleased]: https://github.com/mikebgio/eink-screenplay-writer/commits/main
