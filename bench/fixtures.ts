// Deterministic fixture generators for the benchmarks. A fixed-seed PRNG keeps every run
// identical, so results are comparable between commits.
import type { Finding, OsvOutput, SemgrepOutput, Severity } from '@types';

/** Mulberry32: tiny, fast, seeded. Not for security, only for repeatable fixtures. */
export function prng(seed = 0x5eed): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KB = 1024;
export const SIZES = { small: 10 * KB, medium: 200 * KB, large: 2 * 1024 * KB } as const;

/** Run options for every `bench.compare()`: sample each case for about one second. */
export const RUN = { time: 1000 } as const;

/** Human-readable size for benchmark names. */
export const kb = (bytes: number): string =>
  bytes >= 1024 * KB
    ? `${(bytes / (1024 * KB)).toFixed(1)} MB`
    : `${Math.round(bytes / KB)} KB`;

/** Repeat `unit` until the text is at least `bytes` long, then cut to exactly `bytes`. */
export const fill = (unit: string, bytes: number): string =>
  unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes);

// ------------------------------------------------------------------ source code
const JS_LINES = [
  "import { readFile } from 'node:fs/promises';",
  'export async function load(path) {',
  "  const text = await readFile(path, 'utf8');",
  '  return JSON.parse(text).items.map((item) => ({ id: item.id, name: item.name }));',
  '}',
  '// Fetch the user profile and cache it for five minutes.',
  'const cache = new Map();',
  "if (process.env.NODE_ENV !== 'production') console.debug('cache size', cache.size);",
];

const PY_LINES = [
  'import json',
  'from pathlib import Path',
  'def load(path: Path) -> list[dict]:',
  '    with path.open() as fh:',
  '        return [row for row in json.load(fh) if row.get("active")]',
  '# Small helper used by the CLI entry point.',
];

/** Realistic, benign source code of the given size. */
export const benignJs = (bytes: number): string =>
  fill(`${JS_LINES.join('\n')}\n`, bytes);
export const benignPy = (bytes: number): string =>
  fill(`${PY_LINES.join('\n')}\n`, bytes);

/**
 * Inputs crafted to make the malware regexes work as hard as possible: many partial
 * matches (prefix present, suffix missing) so every bounded quantifier is fully tried.
 */
export const adversarial = {
  /** `curl`/`wget` everywhere, never followed by `| sh`. */
  downloadNoPipe: (bytes: number) =>
    fill('curl wget curl -fsSL http://x/' + 'a'.repeat(150) + '\n', bytes),
  /** `socket.socket(` prefixes with no dup2/pty/sh suffix within reach. */
  socketNoShell: (bytes: number) =>
    fill('socket.socket(' + 'x'.repeat(380) + '\n', bytes),
  /** Long base64-alphabet runs that are never closed by a quote. */
  unterminatedBase64: (bytes: number) => fill(`"${'A'.repeat(2999)}`, bytes),
  /** `powershell` prefixes followed by almost-long-enough encoded blobs. */
  powershellShortBlob: (bytes: number) =>
    fill(`powershell -enc ${'A'.repeat(39)} `, bytes),
  /** Many `_0x` identifiers, but in a minified file (skipped) vs a normal one. */
  obfuscated: (bytes: number) => fill('var _0xa1b2=1;var _0xc3d4=2;', bytes),
  /** Invisible variation selectors in runs one short of the threshold. */
  invisibleShortRuns: (bytes: number) => fill(`a${'\u{FE0F}'.repeat(7)}`, bytes),
};

// ------------------------------------------------------------------- workflows
/** A large but ordinary workflow: `jobs` jobs with `steps` steps each. */
export function workflowYaml(jobs: number, steps: number, extra = ''): string {
  const lines = [
    'name: CI',
    'on: [push, pull_request]',
    'permissions:',
    '  contents: read',
    'jobs:',
  ];
  for (let j = 0; j < jobs; j++) {
    lines.push(
      `  job${j}:`,
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v5',
    );
    for (let s = 0; s < steps; s++) {
      lines.push(
        `      - name: step ${s}`,
        `        run: echo "job ${j} step ${s}" && npm test -- --shard=${s}`,
      );
    }
    if (extra) lines.push(extra);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * A `run:` script full of unterminated `${{` openings, the worst case for the
 * untrusted-expression regex. `field: 'safe'` names a field that is not attacker-controlled
 * (stresses the gap before `github.`); `'untrusted'` names one that is, but never closes
 * the expression (stresses the gap after it).
 */
export function unterminatedExpressions(
  count: number,
  field: 'safe' | 'untrusted' = 'safe',
): string {
  const name = field === 'safe' ? 'number' : 'title';
  const body = Array.from(
    { length: count },
    (_, i) => `\${{ github.event.issue.${name} x${i}`,
  ).join(' ');
  return `on: issue_comment\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "${body}"\n`;
}

// --------------------------------------------------------------- repo file lists
const DIRS = [
  'src',
  'lib',
  'app',
  'pkg',
  'internal',
  'cmd',
  'web',
  'api',
  'test',
  'docs',
];
const EXTS = [
  '.ts',
  '.js',
  '.py',
  '.go',
  '.java',
  '.rb',
  '.php',
  '.rs',
  '.cs',
  '.md',
  '.json',
  '.yml',
];
const MANIFESTS = [
  'package.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'go.mod',
  'requirements.txt',
  'Cargo.lock',
];

/** `count` repository-relative paths, like a medium-to-large monorepo. */
export function repoPaths(count: number, rand = prng()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const depth = 1 + Math.floor(rand() * 4);
    const parts = Array.from(
      { length: depth },
      () => DIRS[Math.floor(rand() * DIRS.length)] ?? 'src',
    );
    const name =
      i % 97 === 0
        ? (MANIFESTS[i % MANIFESTS.length] ?? 'package.json')
        : `file${i}${EXTS[Math.floor(rand() * EXTS.length)] ?? '.ts'}`;
    out.push([...parts, name].join('/'));
  }
  return out;
}

// -------------------------------------------------------------------- findings
const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high', 'critical'];

/** `count` findings spread over checks, severities and files. */
export function findings(count: number, rand = prng()): Finding[] {
  return Array.from({ length: count }, (_, i) => ({
    check:
      (['dependencies', 'code', 'secrets', 'malware', 'workflows'] as const)[i % 5] ??
      'code',
    tool: 'bench',
    severity: SEVERITIES[Math.floor(rand() * SEVERITIES.length)] ?? 'low',
    rule: `rule-${i % 40}`,
    file: `src/dir${i % 50}/file${i % 400}.ts`,
    line: 1 + (i % 500),
    message: `Finding ${i} with \`code\` | pipes <tags> and **bold** text that needs escaping.`,
  }));
}

// ----------------------------------------------------------------- tool output
/** OSV-Scanner output with `packages` vulnerable packages across a few lockfiles. */
export function osvOutput(packages: number): OsvOutput {
  const lockfiles = [
    '/repo/package-lock.json',
    '/repo/web/yarn.lock',
    '/repo/api/pnpm-lock.yaml',
  ];
  return {
    results: lockfiles.map((path, f) => ({
      source: { path, type: 'lockfile' },
      packages: Array.from({ length: Math.ceil(packages / lockfiles.length) }, (_, i) => {
        const id = `GHSA-${f}${i}-aaaa-bbbb`;
        return {
          package: { name: `pkg-${i}`, version: `1.${i % 10}.0`, ecosystem: 'npm' },
          vulnerabilities: [
            {
              id,
              aliases: [`CVE-2026-${10000 + i}`],
              summary: `Prototype pollution in pkg-${i} when merging untrusted objects`,
              affected: [
                {
                  package: { name: `pkg-${i}` },
                  ranges: [{ events: [{ introduced: '0' }, { fixed: `1.${i % 10}.1` }] }],
                },
              ],
            },
          ],
          groups: [
            {
              ids: [id],
              aliases: [id, `CVE-2026-${10000 + i}`],
              max_severity: String((i % 10) + 0.5),
            },
          ],
        };
      }),
    })),
  };
}

/** Semgrep output with `count` results. */
export function semgrepOutput(count: number): SemgrepOutput {
  return {
    results: Array.from({ length: count }, (_, i) => ({
      check_id: `javascript.lang.security.audit.rule-${i % 30}`,
      path: `src/file${i % 300}.js`,
      start: { line: 1 + (i % 200) },
      extra: {
        severity: ['ERROR', 'WARNING', 'INFO'][i % 3] ?? 'INFO',
        message:
          'User input flows into a dangerous sink without sanitisation. Validate or escape it first.',
        metadata: {
          cwe: ['CWE-79: Improper Neutralization of Input During Web Page Generation'],
        },
      },
    })),
  };
}
