import * as exec from '@actions/exec';

import { parseJson } from '@utils';

import { installOsvScanner } from './install';
import { parseOsv } from './parse';

import type { EngineResult, OsvOutput } from '@types';

/** OSV-Scanner exit codes. */
const EXIT_CLEAN = 0;
const EXIT_VULNERABLE = 1;
const EXIT_NO_PACKAGES = 128;

export async function runOsv(root: string, version: string): Promise<EngineResult> {
  const bin = await installOsvScanner(version);
  const res = await exec.getExecOutput(
    bin,
    ['scan', 'source', '--recursive', '--format', 'json', root],
    {
      ignoreReturnCode: true,
      silent: true,
    },
  );
  if (res.exitCode === EXIT_NO_PACKAGES)
    return { findings: [], note: 'no dependency files found' };
  if (res.exitCode !== EXIT_CLEAN && res.exitCode !== EXIT_VULNERABLE) {
    const lastLine = res.stderr.trim().split('\n').filter(Boolean).at(-1) ?? '';
    throw new Error(
      `osv-scanner exited with ${res.exitCode}. ${lastLine.slice(0, 300)} (it needs network access to api.osv.dev)`,
    );
  }
  const json = parseJson(res.stdout || '{}', 'osv-scanner') as OsvOutput;
  return { findings: parseOsv(json, root) };
}
