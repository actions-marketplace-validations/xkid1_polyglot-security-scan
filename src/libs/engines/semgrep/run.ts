import * as core from '@actions/core';
import * as exec from '@actions/exec';

import { parseJson } from '@utils';

import { installSemgrep } from './install';
import { parseSemgrep } from './parse';

import type { EngineResult, SemgrepOutput } from '@types';

/** Above this many changed files, scanning the whole tree is simpler and as fast. */
const MAX_EXPLICIT_TARGETS = 1000;

/**
 * Run Semgrep with the given rulesets.
 * @param targets repository-relative files to scan, or `null` for the whole tree
 */
export async function runSemgrep(
  root: string,
  version: string,
  rulesets: readonly string[],
  targets: readonly string[] | null,
): Promise<EngineResult> {
  const bin = await installSemgrep(version);
  const args = [
    'scan',
    '--json',
    '--metrics=off',
    '--disable-version-check',
    '--quiet',
    '--timeout',
    '20',
    '--max-target-bytes',
    '1000000',
  ];
  for (const ruleset of rulesets) args.push('--config', ruleset);
  const explicit =
    targets?.length && targets.length <= MAX_EXPLICIT_TARGETS ? targets : ['.'];
  // `--` ends option parsing, so a file named like `--config=…` is still just a target.
  args.push('--', ...explicit);

  const res = await exec.getExecOutput(bin, args, {
    cwd: root,
    ignoreReturnCode: true,
    silent: true,
  });
  let json: SemgrepOutput;
  try {
    json = parseJson(res.stdout, 'semgrep') as SemgrepOutput;
  } catch {
    throw new Error(`semgrep exited with ${res.exitCode}: ${res.stderr.slice(-500)}`);
  }
  const errors = (json.errors ?? []).filter((e) => e.level === 'error');
  if (errors.length) {
    core.warning(
      `semgrep reported ${errors.length} error(s), e.g. ${String(errors[0]?.message).slice(0, 200)}`,
    );
  }
  return { findings: parseSemgrep(json, root), note: `rules: ${rulesets.join(', ')}` };
}
