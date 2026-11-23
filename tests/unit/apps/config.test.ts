import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readConfig } from '@apps';
import { createRepo, stubInputs } from '@tests';

const DEFAULTS = {
  'checks': 'dependencies,code,secrets,malware,workflows',
  'fail-on': 'high',
  'scope': 'auto',
  'comment': 'true',
  'comment-when-clean': 'false',
  'trusted-owners': 'actions,github',
  'osv-scanner-version': '2.7.0',
  'gitleaks-version': '8.30.1',
  'semgrep-version': '1.186.0',
};

let workspace = '';
beforeEach(() => {
  workspace = createRepo({});
  vi.stubEnv('GITHUB_WORKSPACE', workspace);
  stubInputs(vi.stubEnv, DEFAULTS);
});

describe('readConfig', () => {
  it('reads and normalises the defaults', () => {
    const config = readConfig();
    expect([...config.checks]).toEqual([
      'dependencies',
      'code',
      'secrets',
      'malware',
      'workflows',
    ]);
    expect(config).toMatchObject({
      failOn: 'high',
      scope: 'auto',
      comment: true,
      commentWhenClean: false,
      trustedOwners: ['actions', 'github'],
      root: workspace,
      sarifFile: path.join(workspace, 'polyglot-security-guard.sarif'),
    });
  });

  it('accepts case-insensitive values and lists', () => {
    stubInputs(vi.stubEnv, {
      'checks': 'Malware, SECRETS',
      'fail-on': 'Critical',
      'exclude': 'a/**\nb/',
    });
    const config = readConfig();
    expect([...config.checks]).toEqual(['malware', 'secrets']);
    expect(config.failOn).toBe('critical');
    expect(config.exclude).toEqual(['a/**', 'b/']);
  });

  it.each([
    [{ checks: 'malware,typo' }, /Unknown check "typo"/],
    [{ 'fail-on': 'severe' }, /Invalid fail-on "severe"/],
    [{ scope: 'some' }, /Invalid scope "some"/],
    [{ 'semgrep-version': '1.0.0 --index-url https://evil' }, /Invalid semgrep version/],
    [{ 'gitleaks-version': 'latest' }, /Invalid gitleaks version/],
    [{ 'osv-scanner-version': '../../x' }, /Invalid osv-scanner version/],
  ])('rejects invalid input %o', (inputs, error) => {
    stubInputs(vi.stubEnv, inputs);
    expect(() => readConfig()).toThrow(error);
  });

  it.each([
    [{ path: '../outside' }, /"path" must stay inside the workspace/],
    [{ path: '/etc' }, /"path" must stay inside the workspace/],
    [
      { 'sarif-file': '../../tmp/x.sarif' },
      /"sarif-file" must stay inside the workspace/,
    ],
  ])('refuses paths outside the workspace %o', (inputs, error) => {
    stubInputs(vi.stubEnv, inputs);
    expect(() => readConfig()).toThrow(error);
  });

  it('resolves sarif-file relative to path', () => {
    stubInputs(vi.stubEnv, { 'path': 'sub', 'sarif-file': 'out.sarif' });
    expect(readConfig().sarifFile).toBe(path.join(workspace, 'sub', 'out.sarif'));
  });
});
