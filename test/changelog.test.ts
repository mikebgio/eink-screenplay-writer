import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkFormat, checkPr, parseChangelog, REPO_URL } from '../scripts/changelog.mjs';

const link = (n: number) => `([#${n}](${REPO_URL}/pull/${n}))`;

const good = `# Changelog

Intro text.

## [Unreleased]

### Added

- Paged print view ${link(8)}
- Writing tools ${link(20)}
- Simpler CI with a readable run summary ${link(29)}

### Changed

- Update dependencies ([#21](${REPO_URL}/pull/21), [#30](${REPO_URL}/pull/30))
- Run checks with one command ${link(29)}

## [0.2.0] - 2026-12-01

### Fixed

- Fix autosave ${link(12)}

## [0.1.0] - 2026-11-20

### Added

- Minimal working app ${link(1)}

[Unreleased]: ${REPO_URL}/compare/v0.2.0...HEAD
[0.2.0]: ${REPO_URL}/compare/v0.1.0...v0.2.0
[0.1.0]: ${REPO_URL}/releases/tag/v0.1.0
`;

describe('parseChangelog', () => {
  it('splits releases, groups, entries and link references', () => {
    const cl = parseChangelog(good);
    expect(cl.releases.map((r) => r.name)).toEqual(['Unreleased', '0.2.0', '0.1.0']);
    expect(cl.releases[1]!.date).toBe('2026-12-01');
    expect(cl.releases[0]!.groups.map((g) => g.name)).toEqual(['Added', 'Changed']);
    expect(cl.releases[0]!.groups[1]!.entries[0]!.prs).toEqual([21, 30]);
    expect(cl.lines[cl.linksStart]).toMatch(/^\[Unreleased\]: /);
    expect(cl.releases[2]!.end).toBe(cl.linksStart);
  });
});

describe('checkFormat', () => {
  it('passes a well-formed file', () => {
    expect(checkFormat(good)).toEqual([]);
  });

  it('passes the real CHANGELOG.md', () => {
    expect(checkFormat(readFileSync('CHANGELOG.md', 'utf8'))).toEqual([]);
  });

  it('fails without an [Unreleased] section', () => {
    const errors = checkFormat(good.replace('## [Unreleased]\n', ''));
    expect(errors.join('\n')).toMatch(/missing `## \[Unreleased\]`/);
  });

  it('fails when [Unreleased] is not first', () => {
    const text = good
      .replace('## [Unreleased]\n', '')
      .replace('## [0.1.0] - 2026-11-20\n', '## [Unreleased]\n\n## [0.1.0] - 2026-11-20\n');
    expect(checkFormat(text).join('\n')).toMatch(/must be the first section/);
  });

  it('fails on a section heading outside the six names', () => {
    const errors = checkFormat(good.replace('### Changed', '### Improvements'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^line 13: section `### Improvements` is not one of Added, Changed/);
  });

  it('fails on an entry without a PR link', () => {
    const errors = checkFormat(good.replace(`- Writing tools ${link(20)}`, '- Writing tools'));
    expect(errors).toEqual([`line 10: entry must end with its PR link, like ([#N](${REPO_URL}/pull/N))`]);
  });

  it('fails when the link text and URL numbers differ', () => {
    const errors = checkFormat(good.replace(`[#20](${REPO_URL}/pull/20)`, `[#20](${REPO_URL}/pull/19)`));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/#20 doesn't match its URL/);
  });

  it('fails when a link points at another repository', () => {
    const errors = checkFormat(good.replace(`[#20](${REPO_URL}/pull/20)`, '[#20](https://github.com/other/repo/pull/20)'));
    expect(errors[0]).toMatch(/#20 doesn't match its URL/);
  });

  it('fails when a PR has more than two lines', () => {
    const text = good.replace(`- Fix autosave ${link(12)}`, `- Fix autosave ${link(29)}`);
    const errors = checkFormat(text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/PR #29 has 3 lines .*at most two/);
  });

  it('fails on a malformed release heading', () => {
    const errors = checkFormat(good.replace('## [0.2.0] - 2026-12-01', '## 0.2.0 (December)'));
    expect(errors.join('\n')).toMatch(/release heading must be `## \[X\.Y\.Z\] - YYYY-MM-DD`/);
  });

  it('fails when releases are not newest first', () => {
    const text = good.replace('## [0.2.0] - 2026-12-01', '## [0.0.9] - 2026-12-01');
    expect(checkFormat(text).join('\n')).toMatch(/newest first: 0\.1\.0 comes after 0\.0\.9/);
  });

  it('fails on an entry outside any ### section', () => {
    const text = good.replace('## [Unreleased]\n', `## [Unreleased]\n\n- Stray ${link(40)}\n`);
    expect(checkFormat(text).join('\n')).toMatch(/not under a `### ` section heading/);
  });
});

describe('checkPr', () => {
  const event = (over: { login?: string; labels?: string[]; title?: string } = {}) => ({
    pull_request: {
      number: 31,
      title: over.title ?? '21: Tab cycles through script elements',
      user: { login: over.login ?? 'mikebgio' },
      labels: (over.labels ?? []).map((name) => ({ name })),
    },
  });

  it('passes when [Unreleased] links the PR', () => {
    expect(checkPr(good, 29, event()).ok).toBe(true);
    expect(checkPr(good, 30, event()).ok).toBe(true); // in a multi-PR line
  });

  it('fails when the entry is missing, and says what to add and where', () => {
    const r = checkPr(good, 31, event());
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no entry for PR #31');
    expect(r.message).toContain('under `## [Unreleased]`, at the bottom of the right section');
    expect(r.message).toContain(`- Tab cycles through script elements ([#31](${REPO_URL}/pull/31))`);
    expect(r.message).toContain('`no-changelog` label');
  });

  it('does not count an entry in a released section', () => {
    expect(checkPr(good, 12, null).ok).toBe(false);
  });

  it('passes with the no-changelog label', () => {
    const r = checkPr(good, 31, event({ labels: ['docs', 'no-changelog'] }));
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/no-changelog/);
  });

  it('passes for a Dependabot PR', () => {
    expect(checkPr(good, 31, event({ login: 'dependabot[bot]' })).ok).toBe(true);
  });
});
