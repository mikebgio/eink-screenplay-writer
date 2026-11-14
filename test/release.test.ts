import { describe, expect, it } from 'vitest';
import {
  bumpVersion,
  findMissing,
  foldDependabot,
  prepareChangelog,
  renderReleaseSummary,
  unreleasedIsEmpty,
  verifyApkVersion,
  versionCode,
} from '../scripts/release.mjs';
import { checkFormat, checkPr, sectionBody, REPO_URL } from '../scripts/changelog.mjs';

const link = (n: number) => `([#${n}](${REPO_URL}/pull/${n}))`;

/** Before the first release: everything is under [Unreleased]. */
const first = `# Changelog

Intro.

## [Unreleased]

### Added

- Minimal working app ${link(1)}

### Fixed

- Fix autosave ${link(10)}

[Unreleased]: ${REPO_URL}/commits/main
`;

/** After 0.1.0, with new work under [Unreleased]. */
const second = `# Changelog

Intro.

## [Unreleased]

### Fixed

- Recent files survive an update ${link(40)}

## [0.1.0] - 2026-11-20

### Added

- Minimal working app ${link(1)}

[Unreleased]: ${REPO_URL}/compare/v0.1.0...HEAD
[0.1.0]: ${REPO_URL}/releases/tag/v0.1.0
`;

describe('version', () => {
  it('versionCode is major × 10000 + minor × 100 + patch', () => {
    expect(versionCode('0.1.0')).toBe(100);
    expect(versionCode('0.1.1')).toBe(101);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'));
  });

  it('versionCode refuses minor or patch of 100 and bad versions', () => {
    expect(() => versionCode('0.100.0')).toThrow(/below 100/);
    expect(() => versionCode('0.1.100')).toThrow(/below 100/);
    expect(() => versionCode('1.0')).toThrow(/X\.Y\.Z/);
  });

  it('bumps patch, minor and major', () => {
    expect(bumpVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(bumpVersion('0.1.4', 'minor')).toBe('0.2.0');
    expect(bumpVersion('0.9.4', 'major')).toBe('1.0.0');
    expect(() => bumpVersion('0.1.0', 'huge')).toThrow(/patch, minor or major/);
  });
});

describe('prepareChangelog', () => {
  it('first release: renames [Unreleased], adds an empty one above, links the tag', () => {
    const out = prepareChangelog(first, '0.1.0', '2026-11-20');
    expect(out).toBe(`# Changelog

Intro.

## [Unreleased]

## [0.1.0] - 2026-11-20

### Added

- Minimal working app ${link(1)}

### Fixed

- Fix autosave ${link(10)}

[Unreleased]: ${REPO_URL}/compare/v0.1.0...HEAD
[0.1.0]: ${REPO_URL}/releases/tag/v0.1.0
`);
    expect(checkFormat(out)).toEqual([]);
    expect(unreleasedIsEmpty(out)).toBe(true);
  });

  it('second release: compares with the previous tag and keeps older link references', () => {
    const out = prepareChangelog(second, '0.1.1', '2026-12-02');
    expect(out).toContain('## [Unreleased]\n\n## [0.1.1] - 2026-12-02\n\n### Fixed\n');
    expect(out).toContain('## [0.1.0] - 2026-11-20');
    expect(out.trimEnd().split('\n').slice(-3)).toEqual([
      `[Unreleased]: ${REPO_URL}/compare/v0.1.1...HEAD`,
      `[0.1.1]: ${REPO_URL}/compare/v0.1.0...v0.1.1`,
      `[0.1.0]: ${REPO_URL}/releases/tag/v0.1.0`,
    ]);
    expect(checkFormat(out)).toEqual([]);
    expect(sectionBody(out, '0.1.1')).toBe(`### Fixed\n\n- Recent files survive an update ${link(40)}`);
  });

  it('adds link references when the file has none', () => {
    const out = prepareChangelog(first.replace(/\[Unreleased\]: .*\n/, ''), '0.1.0', '2026-11-20');
    expect(out.endsWith(`- Fix autosave ${link(10)}\n\n[Unreleased]: ${REPO_URL}/compare/v0.1.0...HEAD\n[0.1.0]: ${REPO_URL}/releases/tag/v0.1.0\n`)).toBe(true);
  });
});

describe('unreleasedIsEmpty', () => {
  it('is true with headings but no entries, false with an entry', () => {
    expect(unreleasedIsEmpty(first)).toBe(false);
    expect(unreleasedIsEmpty(first.replace(/^- .*\n/gm, ''))).toBe(true);
    expect(unreleasedIsEmpty(prepareChangelog(second, '0.1.1', '2026-12-02'))).toBe(true);
  });
});

describe('Dependabot fold-in', () => {
  it('adds one "Update dependencies" line linking each PR, creating Changed in order', () => {
    const out = foldDependabot(first, [33, 21]);
    expect(out).toContain(
      `### Added\n\n- Minimal working app ${link(1)}\n\n### Changed\n\n- Update dependencies ([#21](${REPO_URL}/pull/21), [#33](${REPO_URL}/pull/33))\n\n### Fixed\n`,
    );
    expect(checkFormat(out)).toEqual([]);
  });

  it('appends to an existing Changed section', () => {
    const withChanged = first.replace('### Fixed', `### Changed\n\n- Pin the JDK ${link(2)}\n\n### Fixed`);
    const out = foldDependabot(withChanged, [21]);
    expect(out).toContain(`- Pin the JDK ${link(2)}\n- Update dependencies ([#21](${REPO_URL}/pull/21))\n\n### Fixed`);
  });

  it('fills an empty Changed section', () => {
    const out = foldDependabot(first.replace('### Fixed', '### Changed\n### Fixed'), [21]);
    expect(out).toContain(`### Changed\n\n- Update dependencies ([#21](${REPO_URL}/pull/21))\n### Fixed`);
  });

  it('adds Changed at the end when no later section exists', () => {
    const out = foldDependabot(second.replace('### Fixed', '### Added'), [50]);
    expect(out).toContain(`- Recent files survive an update ${link(40)}\n\n### Changed\n\n- Update dependencies ([#50](${REPO_URL}/pull/50))\n\n## [0.1.0]`);
    expect(checkFormat(out)).toEqual([]);
  });

  it('leaves the file alone with no Dependabot PRs', () => {
    expect(foldDependabot(first, [])).toBe(first);
  });
});

describe('findMissing', () => {
  it('separates Dependabot PRs and skips listed, labelled and release PRs', () => {
    const r = findMissing(second, [
      { number: 1, title: '01: app', author: { login: 'mikebgio' } }, // listed in a released section
      { number: 40, title: 'fix', author: { login: 'mikebgio' } }, // listed
      { number: 41, title: 'Plan docs', author: { login: 'mikebgio' }, labels: [{ name: 'no-changelog' }] },
      { number: 42, title: 'Release v0.1.0', author: { login: 'mikebgio' } },
      { number: 43, title: 'Bump x', author: { login: 'app/dependabot' } },
      { number: 44, title: 'Bump y', author: { login: 'dependabot[bot]' } },
      { number: 45, title: 'Forgot the changelog', author: { login: 'mikebgio' } },
    ]);
    expect(r.dependabot).toEqual([43, 44]);
    expect(r.missing.map((p) => p.number)).toEqual([45]);
  });
});

describe('APK version check', () => {
  const meta = (versionName: string, versionCode: number) => ({ elements: [{ versionName, versionCode }] });

  it('passes when Gradle used package.json', () => {
    expect(verifyApkVersion(meta('0.1.0', 100), '0.1.0')).toEqual([]);
  });

  it('fails on the old hard-coded version', () => {
    expect(verifyApkVersion(meta('1.0', 1), '0.1.0')).toEqual([
      'APK versionName is 1.0, package.json says 0.1.0',
      'APK versionCode is 1, expected 100 for 0.1.0',
    ]);
  });
});

describe('release PR exemption', () => {
  it('passes --check-pr when the PR changes the version', () => {
    const released = prepareChangelog(first, '0.1.0', '2026-11-20');
    expect(checkPr(released, 50, null).ok).toBe(false);
    expect(checkPr(released, 50, null, { versionChanged: true }).ok).toBe(true);
  });
});

describe('release summary', () => {
  it('lists version, tag, release link and each package', () => {
    const md = renderReleaseSummary({
      version: '0.1.0',
      url: 'https://github.com/x/y/releases/tag/v0.1.0',
      files: [{ name: 'scriptwriter-v0.1.0.apk', bytes: 3 * 1024 * 1024, sha256: 'ab12' }],
    });
    expect(md).toContain('| Version | 0.1.0 (versionCode 100) |');
    expect(md).toContain('| Tag | `v0.1.0` |');
    expect(md).toContain('| Release | https://github.com/x/y/releases/tag/v0.1.0 |');
    expect(md).toContain('| `scriptwriter-v0.1.0.apk` | 3.00 MB | `ab12` |');
  });
});
