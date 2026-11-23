import os from 'node:os';
import path from 'node:path';

import * as exec from '@actions/exec';

import { pathExists } from '@utils';

import { assertStrictVersion, runnerTemp } from '../shared';

/** Semgrep is a Python package; it is installed into an isolated virtual environment. */
export async function installSemgrep(version: string): Promise<string> {
  assertStrictVersion('semgrep', version);
  if (os.platform() === 'win32') {
    throw new Error(
      'Semgrep does not support Windows runners; use ubuntu-latest or macos-latest.',
    );
  }
  const venv = path.join(runnerTemp(), `semgrep-${version}`);
  const bin = path.join(venv, 'bin', 'semgrep');
  if (await pathExists(bin)) return bin;

  const probe = await exec.getExecOutput('python3', ['--version'], {
    ignoreReturnCode: true,
    silent: true,
  });
  const python = probe.exitCode === 0 ? 'python3' : 'python';
  await exec.exec(python, ['-m', 'venv', venv], { silent: true });
  await exec.exec(path.join(venv, 'bin', 'pip'), [
    'install',
    '--quiet',
    '--disable-pip-version-check',
    // `version` is validated as MAJOR.MINOR.PATCH, so this is always one exact pin.
    `semgrep==${version}`,
  ]);
  return bin;
}
