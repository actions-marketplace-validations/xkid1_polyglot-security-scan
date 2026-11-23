import { describe, expect, it } from 'vitest';

import { analyzeWorkflow, isWorkflowPath, parseWorkflow } from '@libs';
import { ruleLabels } from '@tests';

const FILE = '.github/workflows/ci.yml';

const BASE = `
name: CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm test
`;

const rules = (
  oldText: string | null,
  newText: string | null,
  opts?: Parameters<typeof analyzeWorkflow>[3],
) => ruleLabels(analyzeWorkflow(oldText, newText, FILE, opts));

describe('analyzeWorkflow', () => {
  it('reports nothing for an unchanged file', () => {
    expect(rules(BASE, BASE)).toEqual([]);
  });

  describe('permissions', () => {
    it('detects id-token: write being added', () => {
      const next = BASE.replace('contents: read', 'contents: read\n  id-token: write');
      expect(rules(BASE, next)).toEqual(['high:permission-added']);
    });

    it('detects write-all', () => {
      expect(
        rules(
          BASE,
          BASE.replace('permissions:\n  contents: read', 'permissions: write-all'),
        ),
      ).toEqual(['high:write-all']);
    });

    it('detects a removed permissions block', () => {
      expect(rules(BASE, BASE.replace('permissions:\n  contents: read\n', ''))).toEqual([
        'medium:permissions-removed',
      ]);
    });

    it('uses a default severity for unknown write scopes and checks jobs', () => {
      const next = BASE.replace(
        '    runs-on: ubuntu-latest',
        '    permissions:\n      wiki: write\n    runs-on: ubuntu-latest',
      );
      expect(rules(BASE, next)).toEqual(['medium:permission-added']);
    });

    it('flags a new workflow without permissions', () => {
      expect(rules(null, BASE.replace('permissions:\n  contents: read\n', ''))).toEqual([
        'low:unpinned-action',
        'medium:no-permissions',
      ]);
    });
  });

  describe('triggers', () => {
    it('detects a dangerous trigger and a pwn request', () => {
      const next = `
on: pull_request_target
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm test
`;
      expect(rules(BASE, next)).toEqual(['high:dangerous-trigger', 'high:pwn-request']);
    });

    it('handles the mapping form of on:', () => {
      const next = BASE.replace(
        'on: [push, pull_request]',
        'on:\n  issue_comment:\n    types: [created]',
      );
      expect(rules(BASE, next)).toEqual(['medium:dangerous-trigger']);
    });

    it('does not crash on Object.prototype names used as keys', () => {
      const next = BASE.replace(
        'on: [push, pull_request]',
        'on:\n  constructor: {}\n  toString: {}',
      ).replace('contents: read', 'contents: read\n  constructor: write');
      expect(() => analyzeWorkflow(BASE, next, FILE)).not.toThrow();
      expect(rules(BASE, next)).toEqual(['medium:permission-added']);
    });
  });

  describe('action references', () => {
    it('classifies new refs', () => {
      const next = BASE.replace(
        '      - run: npm test',
        [
          '      - uses: someone/tool@main',
          '      - uses: someone/other@v2',
          '      - uses: someone/pinned@0123456789abcdef0123456789abcdef01234567',
          '      - uses: actions/setup-node@v5',
          '      - uses: actions/cache@0123456789abcdef0123456789abcdef01234567',
          '      - uses: ./local-action',
          '      - uses: docker://alpine:3',
          '      - uses: docker://alpine@sha256:abc',
          '      - uses: noversion/action',
          '      - run: npm test',
        ].join('\n'),
      );
      expect(rules(BASE, next)).toEqual([
        'high:branch-ref',
        'low:new-third-party-action',
        'low:unpinned-action',
        'medium:unpinned-action',
        'medium:unpinned-action',
        'medium:unpinned-docker',
      ]);
    });

    it('lowers severity for custom trusted owners', () => {
      const next = BASE.replace(
        '      - run: npm test',
        '      - uses: My-Org/tool@v1\n      - run: npm test',
      );
      expect(rules(BASE, next, { trustedOwners: ['actions', 'my-org'] })).toEqual([
        'low:unpinned-action',
      ]);
    });

    it('checks composite action.yml steps', () => {
      const oldA =
        'name: x\nruns:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n';
      const newA =
        'name: x\nruns:\n  using: composite\n  steps:\n    - uses: evil/thing@master\n    - run: echo hi\n      shell: bash\n';
      expect(ruleLabels(analyzeWorkflow(oldA, newA, 'action.yml'))).toEqual([
        'high:branch-ref',
      ]);
    });
  });

  describe('script injection', () => {
    it('detects new attacker-controlled expressions, but not existing ones', () => {
      const next = BASE.replace(
        'npm test',
        'echo "${{ github.event.pull_request.title }}"',
      );
      expect(rules(BASE, next)).toEqual(['high:script-injection']);
      expect(rules(next, next)).toEqual([]);
    });

    it('checks github-script scripts', () => {
      const next = BASE.replace(
        '      - run: npm test',
        '      - uses: actions/github-script@v7\n        with:\n          script: console.log("${{ github.head_ref }}")',
      );
      expect(rules(BASE, next)).toEqual(['high:script-injection', 'low:unpinned-action']);
    });

    it('does not flag safe env usage', () => {
      const next = BASE.replace(
        'npm test',
        'echo "$TITLE"\n        env:\n          TITLE: ${{ github.event.pull_request.title }}',
      );
      expect(rules(BASE, next)).toEqual([]);
    });
  });

  it('detects new secrets, secrets: inherit and self-hosted runners', () => {
    const next = `
on: [push, pull_request]
permissions:
  contents: read
jobs:
  test:
    runs-on: [self-hosted, linux]
    steps:
      - uses: actions/checkout@v5
      - run: npm test
        env:
          KEY: \${{ secrets.NPM_TOKEN }}
  call:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
`;
    expect(rules(BASE, next)).toEqual([
      'high:self-hosted',
      'low:new-secret',
      'medium:secrets-inherit',
    ]);
    expect(rules(BASE, next.replace('on: [push, pull_request]', 'on: push'))).toEqual([
      'low:new-secret',
      'medium:secrets-inherit',
      'medium:self-hosted',
    ]);
  });

  it('handles deleted files, bad YAML and non-object documents', () => {
    expect(rules(BASE, null)).toEqual([]);
    expect(rules(BASE, 'on: [unclosed')).toEqual(['low:parse-error']);
    expect(rules('on: [unclosed', 'just a string')).toEqual([]);
  });

  it('limits YAML alias expansion ("billion laughs")', () => {
    const lines = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 12; i++) {
      const prev = String.fromCharCode(96 + i);
      const cur = String.fromCharCode(97 + i);
      lines.push(`${cur}: &${cur} [${Array(10).fill(`*${prev}`).join(', ')}]`);
    }
    expect(parseWorkflow(lines.join('\n')).ok).toBe(false);
  });

  // The old `[^}]*` regex took ~10 s for 20 000 unclosed `issue.number` openings and ~50 s
  // for 2 000 unclosed `issue.title` ones; linear matching takes about a millisecond. The
  // noise must stay unclosed (a later `}}` lets the old regex finish early), so the real
  // injection sits in a separate step. 2 s is generous for slow CI runners.
  it.each([
    ['number', 20_000],
    ['title', 2_000],
  ] as const)(
    'stays linear on unclosed ${{ github.event.issue.%s expressions ×%i (ReDoS)',
    (field, count) => {
      const noise = Array.from(
        { length: count },
        (_, i) => `\${{ github.event.issue.${field} x${i}`,
      ).join(' ');
      const text = [
        'on: pull_request',
        'jobs:',
        '  a:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        `      - run: 'echo "${noise}"'`,
        `      - run: echo "\${{ github.event.pull_request.title }}"`,
        '',
      ].join('\n');

      const started = performance.now();
      const findings = analyzeWorkflow(null, text, FILE);
      const elapsed = performance.now() - started;

      expect(elapsed).toBeLessThan(2000);
      expect(
        findings.filter((f) => f.rule === 'script-injection').map((f) => f.message),
      ).toEqual([expect.stringContaining('github.event.pull_request.title')]);
    },
  );
});

describe('isWorkflowPath', () => {
  it('matches workflow and action files only', () => {
    expect(isWorkflowPath('.github/workflows/a.yaml')).toBe(true);
    expect(isWorkflowPath('actions/build/action.yml')).toBe(true);
    expect(isWorkflowPath('.github/workflows/nested/a.yml')).toBe(false);
    expect(isWorkflowPath('src/config.yml')).toBe(false);
  });
});
