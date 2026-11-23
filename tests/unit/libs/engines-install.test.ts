import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRepo } from '@tests';

const tc = vi.hoisted(() => ({
  find: vi.fn<(tool: string, version: string) => string>(),
  downloadTool: vi.fn<(url: string) => Promise<string>>(),
  cacheFile: vi.fn<() => Promise<string>>(),
  cacheDir: vi.fn<() => Promise<string>>(),
  extractTar: vi.fn<() => Promise<string>>(),
  extractZip: vi.fn<() => Promise<string>>(),
}));
const exec = vi.hoisted(() => ({
  exec: vi.fn<() => Promise<number>>(),
  getExecOutput:
    vi.fn<
      (
        bin: string,
        args: string[],
      ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    >(),
}));

vi.mock('@actions/tool-cache', () => tc);
vi.mock('@actions/exec', () => exec);
vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

const {
  assertStrictVersion,
  digestsMatch,
  findChecksum,
  runGitleaks,
  runOsv,
  runSemgrep,
  verifyChecksum,
} = await import('@libs');

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('version validation', () => {
  it('accepts only MAJOR.MINOR.PATCH', () => {
    expect(() => assertStrictVersion('tool', '1.186.0')).not.toThrow();
    for (const bad of [
      '',
      'latest',
      '1.2',
      '1.2.3-rc1',
      '1.2.3 --index-url http://evil',
      '../1.2.3',
      'v1.2.3',
    ]) {
      expect(() => assertStrictVersion('tool', bad)).toThrow(/Invalid tool version/);
    }
  });
});

describe('checksums', () => {
  it('finds digests in common formats and rejects malformed ones', () => {
    const digest = sha('x');
    expect(findChecksum(`${digest}  asset.tar.gz\n`, 'asset.tar.gz')).toBe(digest);
    expect(findChecksum(`${digest.toUpperCase()} *asset.exe`, 'asset.exe')).toBe(digest);
    expect(findChecksum(`${digest}  other`, 'asset')).toBeNull();
    expect(findChecksum('nothex  asset', 'asset')).toBeNull();
  });

  it('compares digests in constant time and only full SHA-256 values', () => {
    expect(digestsMatch(sha('a'), sha('a'))).toBe(true);
    expect(digestsMatch(sha('a'), sha('b'))).toBe(false);
    expect(digestsMatch('ab', 'ab')).toBe(false);
  });

  it('accepts a matching binary', async () => {
    const dir = createRepo({ 'bin': 'binary', 'sums.txt': `${sha('binary')}  asset\n` });
    tc.downloadTool
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(path.join(dir, 'sums.txt'));
    await expect(
      verifyChecksum(path.join(dir, 'bin'), 'asset', 'https://x', ['a', 'b']),
    ).resolves.toBeUndefined();
  });

  it('refuses a tampered binary', async () => {
    const dir = createRepo({
      'bin': 'tampered',
      'sums.txt': `${sha('binary')}  asset\n`,
    });
    tc.downloadTool.mockResolvedValue(path.join(dir, 'sums.txt'));
    await expect(
      verifyChecksum(path.join(dir, 'bin'), 'asset', 'https://x', ['a']),
    ).rejects.toThrow(/Checksum mismatch.*Refusing to run it/);
  });

  it('refuses a binary without a published checksum', async () => {
    const dir = createRepo({
      'bin': 'binary',
      'sums.txt': `${sha('binary')}  other-asset\n`,
    });
    tc.downloadTool
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(path.join(dir, 'sums.txt'));
    await expect(
      verifyChecksum(path.join(dir, 'bin'), 'asset', 'https://x', ['a', 'b']),
    ).rejects.toThrow(/refusing to run an unverified binary/);
  });
});

describe('engines', () => {
  it('runOsv parses findings and handles "no packages"', async () => {
    tc.find.mockReturnValue('/cache/osv');
    exec.getExecOutput.mockResolvedValueOnce({ exitCode: 128, stdout: '', stderr: '' });
    expect(await runOsv('/repo', '2.7.0')).toEqual({
      findings: [],
      note: 'no dependency files found',
    });

    exec.getExecOutput.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        results: [
          {
            source: { path: '/repo/go.mod' },
            packages: [{ package: { name: 'x' }, vulnerabilities: [{ id: 'GO-1' }] }],
          },
        ],
      }),
      stderr: '',
    });
    const { findings } = await runOsv('/repo', '2.7.0');
    expect(findings).toHaveLength(1);

    exec.getExecOutput.mockResolvedValueOnce({
      exitCode: 2,
      stdout: '',
      stderr: 'x\nnetwork down\n',
    });
    await expect(runOsv('/repo', '2.7.0')).rejects.toThrow(
      /exited with 2\. network down/,
    );
  });

  it('runOsv downloads, verifies and caches on a cache miss', async () => {
    const dir = createRepo({ bin: 'osv', sums: '' });
    const asset = `osv-scanner_${process.platform === 'darwin' ? 'darwin' : 'linux'}_${process.arch === 'arm64' ? 'arm64' : 'amd64'}`;
    writeFileSync(path.join(dir, 'sums'), `${sha('osv')}  ${asset}\n`);
    tc.find.mockReturnValue('');
    tc.downloadTool.mockImplementation(async (url) =>
      path.join(dir, url.endsWith(asset) ? 'bin' : 'sums'),
    );
    tc.cacheFile.mockResolvedValue('/cache/osv');
    exec.getExecOutput.mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' });
    await runOsv('/repo', '2.7.0');
    expect(tc.cacheFile).toHaveBeenCalledWith(
      path.join(dir, 'bin'),
      'osv-scanner',
      'osv-scanner',
      '2.7.0',
    );
  });

  it('runOsv rejects a malicious version input before downloading anything', async () => {
    await expect(runOsv('/repo', '1.0.0/../../evil')).rejects.toThrow(
      /Invalid osv-scanner version/,
    );
    expect(tc.downloadTool).not.toHaveBeenCalled();
  });

  it('runSemgrep passes targets after "--" and reports invalid JSON', async () => {
    const dir = createRepo({});
    vi.stubEnv('RUNNER_TEMP', dir);
    exec.getExecOutput
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3', stderr: '' }) // python3 --version
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          results: [],
          errors: [{ level: 'error', message: 'rule broke' }],
        }),
        stderr: '',
      });
    const result = await runSemgrep(
      '/repo',
      '1.186.0',
      ['p/default'],
      ['--config=evil.yml'],
    );
    expect(result.note).toBe('rules: p/default');
    expect(exec.getExecOutput.mock.calls[1]?.[1].slice(-2)).toEqual([
      '--',
      '--config=evil.yml',
    ]);
    expect(exec.exec).toHaveBeenCalledWith(
      expect.stringContaining('pip'),
      expect.arrayContaining(['semgrep==1.186.0']),
    );

    exec.getExecOutput.mockResolvedValueOnce({
      exitCode: 2,
      stdout: 'oops',
      stderr: 'bad',
    });
    exec.getExecOutput.mockResolvedValueOnce({
      exitCode: 2,
      stdout: 'oops',
      stderr: 'bad',
    });
    await expect(runSemgrep('/repo', '1.186.0', ['p/default'], null)).rejects.toThrow(
      /semgrep exited with 2: bad/,
    );
  });

  it('runGitleaks reads a fresh report and cleans it up', async () => {
    const tmp = createRepo({});
    vi.stubEnv('RUNNER_TEMP', tmp);
    tc.find.mockReturnValue('/cache/gitleaks');
    let reportPath = '';
    exec.getExecOutput.mockImplementation(async (_bin: string, args: string[]) => {
      reportPath = args[args.indexOf('--report-path') + 1] ?? '';
      writeFileSync(
        reportPath,
        JSON.stringify([
          { RuleID: 'gh-pat', File: '/repo/a.js', StartLine: 1, Secret: 'ghp_x' },
        ]),
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const { findings } = await runGitleaks('/repo', '8.30.1');
    expect(findings).toHaveLength(1);
    expect(path.dirname(path.dirname(reportPath))).toBe(tmp); // private sub-directory of RUNNER_TEMP
    expect(existsSync(reportPath)).toBe(false); // cleaned up

    exec.getExecOutput.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'boom' });
    await expect(runGitleaks('/repo', '8.30.1')).rejects.toThrow(
      /gitleaks exited with 1: boom/,
    );
  });
});
