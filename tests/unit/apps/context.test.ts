import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ payload: {} }));
vi.mock('@actions/github', () => ({ context }));
vi.mock('@actions/core', () => ({ group: vi.fn(), warning: vi.fn() }));

const core = await import('@actions/core');
const { CheckRecorder, currentPullRequest, resolveScope } = await import('@apps');

const base = { owner: 'o', repo: 'r' };

beforeEach(() => {
  context.payload = {};
});

describe('currentPullRequest', () => {
  it('reads a full payload', () => {
    context.payload = {
      pull_request: {
        number: 7,
        base: { sha: 'b' },
        head: { sha: 'h', repo: { name: 'fork', owner: { login: 'someone' } } },
      },
    };
    expect(currentPullRequest(base)).toEqual({
      number: 7,
      baseSha: 'b',
      headSha: 'h',
      headOwner: 'someone',
      headRepo: 'fork',
    });
  });

  it('falls back to the base repo when the head repo is gone, and ignores junk', () => {
    context.payload = { pull_request: { number: 1, head: { repo: null } } };
    expect(currentPullRequest(base)).toMatchObject({
      headOwner: 'o',
      headRepo: 'r',
      baseSha: '',
    });
    context.payload = { pull_request: { number: '1' } };
    expect(currentPullRequest(base)).toBeNull();
    context.payload = {};
    expect(currentPullRequest(base)).toBeNull();
  });
});

describe('resolveScope', () => {
  const pr = { number: 1, baseSha: '', headSha: '', headOwner: 'o', headRepo: 'r' };
  it('resolves auto from the event', () => {
    expect(resolveScope('auto', pr)).toBe('changed');
    expect(resolveScope('auto', null)).toBe('all');
    expect(resolveScope('all', pr)).toBe('all');
    expect(() => resolveScope('changed', null)).toThrow(/only works on pull_request/);
  });
});

describe('CheckRecorder', () => {
  it('records results, failures and skips for enabled checks only', async () => {
    vi.mocked(core.group).mockImplementation((_name, fn) => fn());
    const recorder = new CheckRecorder(new Set(['code', 'secrets']));

    await recorder.run('code', 'semgrep', () =>
      Promise.resolve({
        findings: [
          {
            check: 'code',
            tool: 'semgrep',
            severity: 'low',
            rule: 'r',
            file: 'a',
            message: 'm',
          },
        ],
        note: 'rules',
      }),
    );
    await recorder.run('secrets', 'gitleaks', () =>
      Promise.reject(new Error('down\nhard')),
    );
    await recorder.run('malware', 'built-in', () =>
      Promise.reject(new Error('never called')),
    );
    recorder.skip('code', 'semgrep', 'why');
    recorder.skip('malware', 'built-in', 'not enabled');

    expect(recorder.findings).toHaveLength(1);
    expect(recorder.engines).toEqual([
      { check: 'code', tool: 'semgrep', status: '✅ ran (1 finding)', note: 'rules' },
      { check: 'secrets', tool: 'gitleaks', status: '⚠️ failed', note: 'down hard' },
      { check: 'code', tool: 'semgrep', status: '⏭️ skipped — why' },
    ]);
    expect(core.warning).toHaveBeenCalledWith('gitleaks (secrets) failed: down hard');
  });
});
