import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

interface Rule {
  type: string;
  parameters?: Record<string, unknown>;
}
interface Ruleset {
  name: string;
  target: string;
  enforcement: string;
  bypass_actors: unknown[];
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: Rule[];
}

const ruleset = JSON.parse(read('.github/rulesets/main.json')) as Ruleset;
const rule = (type: string) => ruleset.rules.find((r) => r.type === type);

describe('.github/rulesets/main.json', () => {
  it('is an active branch ruleset for main with no bypass actors', () => {
    expect(ruleset.target).toBe('branch');
    expect(ruleset.enforcement).toBe('active');
    expect(ruleset.conditions.ref_name.include).toEqual(['refs/heads/main']);
    expect(ruleset.bypass_actors).toEqual([]);
  });

  it('keeps the deletion, non-fast-forward and pull-request rules', () => {
    expect(rule('deletion')).toBeDefined();
    expect(rule('non_fast_forward')).toBeDefined();
    expect(rule('pull_request')?.parameters?.required_approving_review_count).toBe(0);
  });

  it('allows squash merges only', () => {
    expect(rule('pull_request')?.parameters?.allowed_merge_methods).toEqual(['squash']);
  });

  it('requires the ci check and does not require the branch to be up to date', () => {
    const checks = rule('required_status_checks')?.parameters;
    // 15368 is GitHub Actions: only checks reported by Actions satisfy the gate.
    expect(checks?.required_status_checks).toEqual([
      { context: 'ci', integration_id: 15368 },
      { context: 'changelog', integration_id: 15368 },
    ]);
    expect(checks?.strict_required_status_checks_policy).toBe(false);
  });

  it('requires a context that matches a job name in the CI workflow', () => {
    const workflow = read('.github/workflows/main.yml');
    expect(workflow).toMatch(/^ {2}ci:\n {4}name: ci$/m);
  });
});

describe('scripts/apply-ruleset.sh', () => {
  const script = read('scripts/apply-ruleset.sh');

  it('PUTs the repo ruleset file, then reads the rules back', () => {
    expect(script).toMatch(/gh api --method PUT .*--input .*\.github\/rulesets\/main\.json/);
    expect(script).toMatch(/gh api "repos\/\$REPO\/rulesets\/\$RULESET_ID"[^\n]*--jq/);
  });

  it('saves the live ruleset before the PUT, and reads back conditions and bypass actors', () => {
    const save = script.indexOf('> "$BACKUP"');
    expect(save).toBeGreaterThan(-1);
    expect(save).toBeLessThan(script.indexOf('--method PUT'));
    expect(script).toMatch(/--jq '[^\n]*conditions[^\n]*bypass_actors/);
  });
});
