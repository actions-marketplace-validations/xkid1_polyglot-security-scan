import { describe, expect, it } from 'vitest';

import { detect, languageOf, semgrepRulesets, SKIP_DIRS } from '@libs';
import { createRepo } from '@tests';
import { listFiles } from '@utils';

describe('detect', () => {
  it('detects languages and ecosystems, skipping vendored dirs', async () => {
    const root = createRepo({
      'src/a.py': '',
      'src/b.py': '',
      'web/app.ts': '',
      'cmd/main.go': '',
      'lib/x.rb': '',
      'App.java': '',
      'Program.cs': '',
      'index.php': '',
      'run.sh': '',
      'requirements.txt': 'flask==2.0.0',
      'go.mod': 'module x',
      'package-lock.json': '{}',
      'app.csproj': '<Project/>',
      'node_modules/lodash/index.js': '',
      'vendor/foo/bar.php': '',
    });
    const { languages, ecosystems } = detect(
      await listFiles(root, { skipDirs: SKIP_DIRS }),
    );
    const names = languages.map((l) => l.name);

    for (const name of [
      'Python',
      'TypeScript',
      'Go',
      'Ruby',
      'Java',
      'C#',
      'PHP',
      'Shell',
    ]) {
      expect(names).toContain(name);
    }
    expect(languages[0]?.name).toBe('Python'); // most files first
    expect(languages.find((l) => l.name === 'PHP')?.files).toBe(1); // vendor/ skipped
    expect(names).not.toContain('JavaScript'); // node_modules/ skipped
    expect(ecosystems.map((e) => e.name).sort()).toEqual(['Go', 'NuGet', 'PyPI', 'npm']);

    const rulesets = semgrepRulesets(languages);
    expect(rulesets[0]).toBe('p/default');
    for (const r of [
      'p/python',
      'p/golang',
      'p/typescript',
      'p/ruby',
      'p/java',
      'p/csharp',
      'p/php',
    ]) {
      expect(rulesets).toContain(r);
    }
  });

  it('ignores file names that collide with Object.prototype keys', () => {
    const { ecosystems, languages } = detect([
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ]);
    expect(ecosystems).toEqual([]);
    expect(languages).toEqual([]);
  });

  it('matches extensions case-sensitively first, then lower-case', () => {
    expect(languageOf('script.R')).toBe('r');
    expect(languageOf('MAIN.PY')).toBe('python');
    expect(languageOf('README')).toBeNull();
  });
});
