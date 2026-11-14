import { describe, expect, it } from 'vitest';
import { renderSummary, renderTests, renderLint, renderResult } from '../scripts/ci-summary.mjs';

const root = '/repo';

const passingVitest = {
  numTotalTests: 3,
  numPassedTests: 3,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  startTime: 1000,
  testResults: [
    {
      name: '/repo/test/a.test.ts',
      startTime: 1000,
      endTime: 2200,
      assertionResults: [
        { status: 'passed', fullName: 'a works', title: 'works', ancestorTitles: ['a'] },
        { status: 'passed', fullName: 'a still works', title: 'still works', ancestorTitles: ['a'] },
      ],
    },
    {
      name: '/repo/test/b.test.ts',
      startTime: 1100,
      endTime: 3500,
      assertionResults: [{ status: 'passed', fullName: 'b works', title: 'works', ancestorTitles: ['b'] }],
    },
  ],
};

const allSuccess = { typecheck: 'success', lint: 'success', tests: 'success', plan: 'success', apk: 'success' };

describe('ci-summary', () => {
  it('renders all five sections for a passing run', () => {
    const md = renderSummary({
      outcomes: allSuccess,
      vitest: passingVitest,
      eslint: [{ filePath: '/repo/src/a.ts', messages: [], errorCount: 0, warningCount: 0 }],
      apk: { name: 'app-debug.apk', bytes: 5 * 1024 * 1024, sha256: 'abc123', versionName: '0.1.0', versionCode: 100 },
      plans: [
        { file: 'PLAN.md', progress: '10/16 tickets complete.' },
        { file: 'PLAN-2.md', progress: '1/8 tickets complete.' },
      ],
      next: '🟢 18 Merge gates on main  [haiku]  tickets/18-repo-merge-gates.md\n',
      root,
    });
    for (const h of ['## Result', '## Tests', '## Lint', '## Package', '## Plan']) expect(md).toContain(h);
    expect(md).toContain('| Typecheck | ✅ |');
    expect(md).toContain('| APK | ✅ |');
    expect(md).toContain('**2** files · **3** passed · **0** failed · **0** skipped · 2.5 s');
    expect(md).not.toContain('Failed tests');
    expect(md).toContain('**0** errors · **0** warnings');
    expect(md).toContain('| Size | 5.00 MB |');
    expect(md).toContain('| SHA-256 | `abc123` |');
    expect(md).toContain('| versionName | 0.1.0 (versionCode 100) |');
    expect(md).toContain('- **PLAN-2.md:** 1/8 tickets complete.');
    expect(md).toContain('🟢 18 Merge gates on main');
    expect(md).not.toContain('not run');
  });

  it('names failed tests', () => {
    const md = renderTests({
      ...passingVitest,
      numPassedTests: 2,
      numFailedTests: 1,
      testResults: [
        {
          name: `${process.cwd()}/test/a.test.ts`,
          startTime: 1000,
          endTime: 2000,
          assertionResults: [
            { status: 'passed', fullName: 'a works', title: 'works' },
            { status: 'failed', fullName: 'a breaks on empty input', title: 'breaks on empty input' },
            { status: 'failed', title: 'no full name', ancestorTitles: ['outer', 'inner'] },
          ],
        },
      ],
    });
    expect(md).toContain('**1** failed');
    expect(md).toContain('Failed tests:');
    expect(md).toContain('- `test/a.test.ts` a breaks on empty input');
    expect(md).toContain('- `test/a.test.ts` outer › inner › no full name');
  });

  it('counts lint problems and lists the first ten as file:line rule', () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      ruleId: i === 0 ? null : 'no-unused-vars',
      severity: i < 11 ? 2 : 1,
      line: i + 1,
      message: 'x',
    }));
    const md = renderLint([{ filePath: '/repo/src/bad.ts', messages, errorCount: 11, warningCount: 1 }], root);
    expect(md).toContain('**11** errors · **1** warnings');
    expect(md).toContain('- `src/bad.ts:1` (parse error)');
    expect(md).toContain('- `src/bad.ts:10` no-unused-vars');
    expect(md).not.toContain('src/bad.ts:11`');
    expect(md).toContain('- … and 2 more');
  });

  it('shows "not run" for missing results and failed outcomes as ❌', () => {
    const md = renderSummary({
      outcomes: { typecheck: 'success', lint: 'failure', tests: 'skipped' },
      vitest: null,
      eslint: null,
      apk: null,
      plans: null,
      next: null,
    });
    expect(md).toContain('| Lint | ❌ |');
    expect(md).toContain('| Tests | not run |');
    expect(md).toContain('| APK | not run |');
    expect(md).toMatch(/## Tests\n\nnot run/);
    expect(md).toMatch(/## Lint\n\nnot run/);
    expect(md).toMatch(/## Package\n\nnot run/);
    expect(md).toMatch(/## Plan\n\nnot run/);
  });

  it('lists every check in the Result table even with no outcomes', () => {
    const md = renderResult({});
    expect(md.match(/\| not run \|/g)).toHaveLength(5);
  });
});
