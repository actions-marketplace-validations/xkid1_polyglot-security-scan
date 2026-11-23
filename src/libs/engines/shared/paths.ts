import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { nonEmptyOr, toPosix } from '@utils';

/** The runner's temp directory (`RUNNER_TEMP`), or the OS temp dir outside Actions. */
export const runnerTemp = (): string => nonEmptyOr(process.env.RUNNER_TEMP, os.tmpdir());

/** A fresh, private temp directory, so reports from earlier runs can never be reused. */
export const makeTempDir = (prefix: string): Promise<string> =>
  mkdtemp(path.join(runnerTemp(), `${prefix}-`));

/** A tool-reported path as a repository-relative `/` path (`''` when missing). */
export function toRepoPath(root: string, reported: string | null | undefined): string {
  if (!reported) return '';
  const rel = path.isAbsolute(reported)
    ? path.relative(root, reported)
    : reported.replace(/^\.\//, '');
  return toPosix(rel);
}
