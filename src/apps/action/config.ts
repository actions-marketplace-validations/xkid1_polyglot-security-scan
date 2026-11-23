// Reads and validates every action input in one place. Anything invalid fails the run
// up front with a clear message, before any tool is downloaded or any file is read.
import path from 'node:path';

import * as core from '@actions/core';

import { assertStrictVersion } from '@libs';
import { isInsideOrEqual, isOneOf, nonEmptyOr, parseList } from '@utils';

import {
  ALL_CHECKS,
  DEFAULT_SARIF_FILE,
  FAIL_ON_VALUES,
  SCOPE_VALUES,
} from './constants';

import type { ActionConfig, CheckId } from '@types';

/** Lower-cased input with a default for empty values. */
const choice = (name: string, fallback: string): string =>
  (core.getInput(name) || fallback).trim().toLowerCase();

function readChecks(): ReadonlySet<CheckId> {
  const raw = parseList(core.getInput('checks') || ALL_CHECKS.join(',')).map((c) =>
    c.toLowerCase(),
  );
  const checks = new Set<CheckId>();
  for (const check of raw) {
    if (!isOneOf(ALL_CHECKS, check)) {
      throw new Error(`Unknown check "${check}". Use: ${ALL_CHECKS.join(', ')}`);
    }
    checks.add(check);
  }
  return checks;
}

/**
 * Resolve a path input against `base` and refuse anything outside `workspace`, so a
 * workflow cannot point the action at (or make it write to) arbitrary runner paths.
 */
function pathInWorkspace(
  name: string,
  value: string,
  base: string,
  workspace: string,
): string {
  const resolved = path.resolve(base, value);
  if (!isInsideOrEqual(workspace, resolved)) {
    throw new Error(
      `Input "${name}" must stay inside the workspace (${workspace}); got "${value}".`,
    );
  }
  return resolved;
}

/** Read and validate all inputs. Throws on the first invalid one. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ActionConfig {
  const workspace = path.resolve(nonEmptyOr(env.GITHUB_WORKSPACE, process.cwd()));

  const failOn = choice('fail-on', 'high');
  if (!isOneOf(FAIL_ON_VALUES, failOn)) {
    throw new Error(`Invalid fail-on "${failOn}". Use: ${FAIL_ON_VALUES.join(', ')}`);
  }
  const scope = choice('scope', 'auto');
  if (!isOneOf(SCOPE_VALUES, scope)) {
    throw new Error(`Invalid scope "${scope}". Use: ${SCOPE_VALUES.join(', ')}`);
  }

  const versions = {
    osv: core.getInput('osv-scanner-version'),
    gitleaks: core.getInput('gitleaks-version'),
    semgrep: core.getInput('semgrep-version'),
  };
  assertStrictVersion('osv-scanner', versions.osv);
  assertStrictVersion('gitleaks', versions.gitleaks);
  assertStrictVersion('semgrep', versions.semgrep);

  const root = pathInWorkspace(
    'path',
    core.getInput('path') || '.',
    workspace,
    workspace,
  );
  const sarifFile = pathInWorkspace(
    'sarif-file',
    core.getInput('sarif-file') || DEFAULT_SARIF_FILE,
    root,
    workspace,
  );

  return {
    token: core.getInput('github-token'),
    checks: readChecks(),
    failOn,
    scope,
    comment: core.getBooleanInput('comment'),
    commentWhenClean: core.getBooleanInput('comment-when-clean'),
    trustedOwners: parseList(core.getInput('trusted-owners')),
    exclude: parseList(core.getInput('exclude')),
    semgrepRules: parseList(core.getInput('semgrep-rules')),
    root,
    sarifFile,
    versions,
  };
}
