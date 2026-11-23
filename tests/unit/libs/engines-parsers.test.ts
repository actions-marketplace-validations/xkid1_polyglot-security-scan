import { describe, expect, it } from 'vitest';

import { parseGitleaks, parseOsv, parseSemgrep, toRepoPath } from '@libs';

import type { OsvOutput } from '@types';

describe('parseOsv', () => {
  const json: OsvOutput = {
    results: [
      {
        source: { path: '/repo/package-lock.json', type: 'lockfile' },
        packages: [
          {
            package: { name: 'lodash', version: '4.17.20', ecosystem: 'npm' },
            vulnerabilities: [
              {
                id: 'GHSA-35jh-r3h4-6jhm',
                aliases: ['CVE-2021-23337'],
                summary: 'Command Injection in lodash',
                affected: [
                  {
                    package: { name: 'lodash' },
                    ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
                  },
                  {
                    package: { name: 'other' },
                    ranges: [{ events: [{ fixed: '9.9.9' }] }],
                  },
                ],
              },
            ],
            groups: [
              {
                ids: ['GHSA-35jh-r3h4-6jhm'],
                aliases: ['GHSA-35jh-r3h4-6jhm', 'CVE-2021-23337'],
                max_severity: '7.2',
              },
            ],
          },
          {
            package: { name: 'evil-pkg', version: '1.0.0', ecosystem: 'npm' },
            vulnerabilities: [
              { id: 'MAL-2025-1234', summary: 'Malicious code in evil-pkg' },
            ],
            groups: [{ ids: ['MAL-2025-1234'], max_severity: '' }],
          },
          {
            package: { name: 'requests', version: '2.0.0', ecosystem: 'PyPI' },
            vulnerabilities: [
              {
                id: 'PYSEC-1',
                summary: '',
                details: 'from details',
                database_specific: { severity: 'MODERATE' },
              },
            ],
          },
          {
            package: { name: 'x', version: '1', ecosystem: 'Go' },
            vulnerabilities: [{ id: 'GO-1', summary: 'crit' }],
            groups: [{ ids: ['GO-1'], max_severity: '9.8' }],
          },
          {
            package: { name: 'y', version: '1', ecosystem: 'Go' },
            vulnerabilities: [{ id: 'GO-2', summary: 'low' }],
            groups: [{ ids: ['GO-2'], max_severity: '2.0' }],
          },
        ],
      },
    ],
  };

  it('maps severity, fix versions, malicious packages and repo-relative paths', () => {
    const [lodash, evil, requests, crit, low] = parseOsv(json, '/repo');
    expect(lodash?.severity).toBe('high');
    expect(lodash?.file).toBe('package-lock.json');
    expect(lodash?.message).toMatch(/GHSA-35jh-r3h4-6jhm \/ CVE-2021-23337/);
    expect(lodash?.message).toMatch(/upgrade to 4\.17\.21\./);
    expect(lodash?.message).not.toMatch(/9\.9\.9/); // fix for a different package
    expect(evil?.severity).toBe('critical');
    expect(evil?.rule).toBe('malicious-package');
    expect(requests?.severity).toBe('medium');
    expect(requests?.message).toMatch(/from details/);
    expect(requests?.message).toMatch(/No fixed version yet/);
    expect(crit?.severity).toBe('critical');
    expect(low?.severity).toBe('low');
  });

  it('tolerates empty or missing output', () => {
    expect(parseOsv(null, '/repo')).toEqual([]);
    expect(parseOsv({ results: [{ packages: [{}] }] }, '/repo')).toEqual([]);
  });
});

describe('parseSemgrep', () => {
  it('maps severity, line and CWE', () => {
    const [high, medium, low] = parseSemgrep(
      {
        results: [
          {
            check_id: 'python.lang.security.audit.formatted-sql-query',
            path: 'app/db.py',
            start: { line: 12 },
            extra: {
              severity: 'ERROR',
              message: 'SQL built with string formatting.',
              metadata: { cwe: ['CWE-89: SQL Injection'] },
            },
          },
          {
            check_id: 'a.b',
            path: './x.js',
            extra: { severity: 'WARNING', metadata: { cwe: 'CWE-79' } },
          },
          { extra: { severity: 'INFO' } },
        ],
      },
      '/repo',
    );
    expect(high).toMatchObject({ severity: 'high', line: 12, file: 'app/db.py' });
    expect(high?.message).toMatch(/CWE-89/);
    expect(high?.message).toMatch(/\[`formatted-sql-query`\]/);
    expect(medium).toMatchObject({ severity: 'medium', file: 'x.js' });
    expect(low).toMatchObject({ severity: 'low', rule: 'semgrep', file: '' });
  });
});

describe('parseGitleaks', () => {
  it('never copies the secret into findings', () => {
    const findings = parseGitleaks(
      [
        {
          RuleID: 'aws-access-token',
          Description: 'AWS Access Key',
          File: '/repo/config.js',
          StartLine: 3,
          Secret: 'AKIAABCDEFGHIJKLMNOP',
          Match: 'key = "AKIAABCDEFGHIJKLMNOP"',
        },
        { RuleID: 42, File: ['x'], StartLine: '7' },
        'not an object',
      ],
      '/repo',
    );
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ file: 'config.js', line: 3, severity: 'high' });
    expect(findings[1]).toMatchObject({ rule: 'secret', file: '', line: undefined });
    expect(JSON.stringify(findings)).not.toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('returns nothing for non-array output', () => {
    expect(parseGitleaks({ RuleID: 'x' }, '/repo')).toEqual([]);
  });
});

describe('toRepoPath', () => {
  it('normalises tool-reported paths', () => {
    expect(toRepoPath('/repo', '/repo/a/b.js')).toBe('a/b.js');
    expect(toRepoPath('/repo', './a.js')).toBe('a.js');
    expect(toRepoPath('/repo', undefined)).toBe('');
  });
});
