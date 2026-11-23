import { readTextFile } from '@utils';

import type { Finding } from '@types';

/** Put this in a comment on the flagged line, or the line above it, to silence a finding. */
export const IGNORE_TAG = 'security-guard: ignore';

/**
 * Drop findings whose line (or the line above) carries {@link IGNORE_TAG}. Files are read
 * through `readTextFile`, so paths reported by a scanner can never escape `root`.
 */
export async function applyInlineIgnores<T extends Pick<Finding, 'file' | 'line'>>(
  root: string,
  findings: readonly T[],
): Promise<T[]> {
  const cache = new Map<string, readonly string[]>();
  const linesOf = async (file: string): Promise<readonly string[]> => {
    let lines = cache.get(file);
    if (!lines) {
      lines = (await readTextFile(root, file))?.split('\n') ?? [];
      cache.set(file, lines);
    }
    return lines;
  };

  const kept: T[] = [];
  for (const f of findings) {
    if (!f.line || !f.file) {
      kept.push(f);
      continue;
    }
    const lines = await linesOf(f.file);
    const ignored = [lines[f.line - 1], lines[f.line - 2]].some((l) =>
      l?.includes(IGNORE_TAG),
    );
    if (!ignored) kept.push(f);
  }
  return kept;
}
