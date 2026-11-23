// Start-up cost on big repositories: walking the tree, applying `exclude` globs and
// detecting languages/ecosystems. listFiles() caps a walk at 50 000 files.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, it } from 'vitest';

import { detect, SKIP_DIRS } from '@libs';
import { listFiles, makeMatcher } from '@utils';

import { repoPaths, RUN } from './fixtures';

describe('detection', () => {
  // A real on-disk tree for the walk, created once and removed afterwards.
  let root = '';
  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'psg-bench-'));
    for (const file of repoPaths(5_000)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), '');
    }
    for (let i = 0; i < 2_000; i++) {
      const file = path.join(root, 'node_modules', `dep${i % 50}`, `f${i}.js`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, '');
    }
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('repository walk, globs and detection', async ({ bench }) => {
    const paths = repoPaths(50_000);
    const exclude = makeMatcher([
      'test/**',
      'docs/',
      '**/*.min.js',
      'vendor/**',
      'web/**/fixtures/**',
    ]);
    await bench.compare(
      bench('listFiles: 5 000 files + 2 000 skipped in node_modules', async () => {
        await listFiles(root, { skipDirs: SKIP_DIRS });
      }),
      bench('detect: 50 000 paths', () => {
        detect(paths);
      }),
      bench('exclude: 5 globs × 50 000 paths', () => {
        for (const file of paths) exclude(file);
      }),
      RUN,
    );
  });
});
