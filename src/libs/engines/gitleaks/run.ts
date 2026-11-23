import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import * as exec from '@actions/exec';

import { parseJson, pathExists } from '@utils';

import { makeTempDir } from '../shared';

import { installGitleaks } from './install';
import { parseGitleaks } from './parse';

import type { EngineResult } from '@types';

export async function runGitleaks(root: string, version: string): Promise<EngineResult> {
  const bin = await installGitleaks(version);
  // A fresh private directory: a report left by an earlier step can never be picked up,
  // and the (redacted) report is deleted afterwards.
  const dir = await makeTempDir('gitleaks');
  const report = path.join(dir, 'report.json');
  try {
    const res = await exec.getExecOutput(
      bin,
      [
        'dir',
        root,
        '--report-format',
        'json',
        '--report-path',
        report,
        '--no-banner',
        '--redact',
        '--exit-code',
        '0',
        '--log-level',
        'warn',
      ],
      { ignoreReturnCode: true, silent: true },
    );
    if (res.exitCode !== 0) {
      throw new Error(`gitleaks exited with ${res.exitCode}: ${res.stderr.slice(-500)}`);
    }
    // No report file means gitleaks found nothing to write.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- report lives in a private mkdtemp directory created above
    const text = (await pathExists(report)) ? await readFile(report, 'utf8') : '';
    return { findings: parseGitleaks(parseJson(text || '[]', 'gitleaks'), root) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
