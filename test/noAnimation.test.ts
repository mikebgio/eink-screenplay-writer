import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}

describe('e-ink: no animation', () => {
  it('has the global reset', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(
      /\*,\s*\*::before,\s*\*::after\s*{[^}]*transition:\s*none\s*!important[^}]*animation:\s*none\s*!important|\*,\s*\*::before,\s*\*::after\s*{[^}]*animation:\s*none\s*!important[^}]*transition:\s*none\s*!important/,
    );
    expect(css).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it('declares no transition/animation anywhere else', () => {
    const decl = /(^|[\s{;"'`])(transition|animation)(-[a-z-]+)?\s*:/;
    const offenders: string[] = [];
    for (const f of walk('src').filter((f) => /\.(css|tsx?)$/.test(f) && !f.startsWith('src/engine'))) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!decl.test(line)) return;
          if (f.endsWith('styles.css') && /:\s*none\s*!important/.test(line)) return;
          offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
