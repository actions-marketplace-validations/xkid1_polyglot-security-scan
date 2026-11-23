// End-to-end suite: runs the shipped bundle (dist/index.js) the way the GitHub runner does,
// with the defaults from action.yml, the real scanners downloaded and checksum-verified,
// and real network calls (api.osv.dev, Semgrep registry), against generated repositories.
//
//   yarn e2e                 # uses the current dist/ (run `yarn build` first)
//   E2E_STRICT=1 yarn e2e    # CI mode: every engine must run, nothing is tolerated
//
// Outside CI, a machine without a working Python venv cannot install Semgrep; the suite
// then reports the code check as not verified instead of failing.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { createCleanRepo, createVulnerableRepo } from './fixtures.mjs';

/** @typedef {Record<string, string>} StringMap */
/** @typedef {{ check: string, file: string, rule: string, severity: string }} FindingLike */
/**
 * @typedef {object} RunResult
 * @property {number | null} status
 * @property {string} stdout
 * @property {string} stderr
 * @property {StringMap} outputs
 * @property {string} summary
 * @property {FindingLike[]} findings
 */
/** @typedef {(ok: boolean, what: string) => void} Check */
/** @typedef {(message: string) => void} Note */
/** @typedef {{ name: string, run: (check: Check, note: Note) => void }} Scenario */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUNDLE = path.join(ROOT, 'dist', 'index.js');
const STRICT = process.env.E2E_STRICT === '1' || process.env.CI === 'true';
const WINDOWS = process.platform === 'win32';

if (!existsSync(BUNDLE)) {
  throw new Error('dist/index.js is missing. Run `yarn build` first.');
}

// ---------------------------------------------------------------- environment
/** Semgrep is installed with `python -m venv` + pip; check that this machine can do it. */
function canInstallSemgrep() {
  if (WINDOWS) return false;
  for (const python of ['python3', 'python']) {
    const probe = spawnSync(python, ['-c', 'import ensurepip, venv'], {
      encoding: 'utf8',
    });
    if (probe.status === 0) return true;
  }
  return false;
}
const SEMGREP_EXPECTED = STRICT ? !WINDOWS : canInstallSemgrep();

/**
 * Inputs exactly as a user gets them: the defaults declared in action.yml.
 * @returns {StringMap}
 */
function actionDefaults() {
  /** @type {{ inputs?: Record<string, { default?: unknown }> }} */
  const action = YAML.parse(readFileSync(path.join(ROOT, 'action.yml'), 'utf8'));
  /** @type {StringMap} */
  const inputs = {};
  for (const [name, spec] of Object.entries(action.inputs ?? {})) {
    inputs[name] = String(spec.default ?? '');
  }
  inputs['github-token'] = ''; // `${{ github.token }}` only resolves on a real runner
  return inputs;
}
const DEFAULTS = actionDefaults();

const work = mkdtempSync(path.join(os.tmpdir(), 'psg-e2e-'));
// Shared across scenarios, like a real runner: scanners are downloaded once.
const toolCache = path.join(work, 'tool-cache');
const runnerTemp = path.join(work, 'runner-temp');
mkdirSync(toolCache);
mkdirSync(runnerTemp);

/**
 * Parse the runner's GITHUB_OUTPUT file (`name<<delimiter` heredoc format).
 * @param {string} text
 * @returns {StringMap}
 */
function parseOutputs(text) {
  /** @type {StringMap} */
  const outputs = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = /^([^<=]+)<<(.+)$/.exec(lines[i] ?? '');
    if (!match?.[1] || !match[2]) continue;
    const [name, delimiter] = [match[1], match[2]];
    const value = [];
    for (i++; i < lines.length && lines[i] !== delimiter; i++) value.push(lines[i]);
    outputs[name] = value.join('\n');
  }
  return outputs;
}

let runCounter = 0;
/**
 * Run dist/index.js like the runner: INPUT_* variables, GITHUB_* files, a push event.
 * @param {string} workspace
 * @param {StringMap} [inputs]
 * @returns {RunResult}
 */
function runAction(workspace, inputs = {}) {
  const dir = path.join(work, `run-${++runCounter}`);
  mkdirSync(dir);
  const files = {
    output: path.join(dir, 'output'),
    summary: path.join(dir, 'summary.md'),
    event: path.join(dir, 'event.json'),
  };
  writeFileSync(files.output, '');
  writeFileSync(files.summary, '');
  writeFileSync(files.event, JSON.stringify({ ref: 'refs/heads/main' }));

  /** @type {NodeJS.ProcessEnv} */
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(INPUT_|GITHUB_|RUNNER_)/.test(k)),
  );
  for (const [name, value] of Object.entries({ ...DEFAULTS, ...inputs })) {
    env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value;
  }
  Object.assign(env, {
    GITHUB_WORKSPACE: workspace,
    GITHUB_OUTPUT: files.output,
    GITHUB_STEP_SUMMARY: files.summary,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_EVENT_PATH: files.event,
    GITHUB_REPOSITORY: 'e2e/fixture',
    RUNNER_TEMP: runnerTemp,
    RUNNER_TOOL_CACHE: toolCache,
  });

  const res = spawnSync(process.execPath, [BUNDLE], {
    env,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const outputs = parseOutputs(readFileSync(files.output, 'utf8'));
  const summary = readFileSync(files.summary, 'utf8');
  /** @type {FindingLike[]} */
  let findings = [];
  try {
    findings = JSON.parse(outputs.findings ?? '[]');
  } catch {
    /* an invalid `findings` output fails the count assertion below */
  }
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    outputs,
    summary,
    findings,
  };
}

/**
 * Status cell of each row in the "Checks that ran" table, by check label.
 * @param {string} summary
 * @returns {StringMap}
 */
function engineRows(summary) {
  /** @type {StringMap} */
  const rows = {};
  for (const line of summary.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const [, label, , status] = cells;
    if (label && status && /ran|failed|skipped/.test(status)) rows[label] = status;
  }
  return rows;
}

/**
 * No engine may fail. Semgrep must run (and find the injection) wherever it can be
 * installed, and must be reported as skipped on Windows.
 * @param {RunResult} r @param {Set<string>} codeFiles @param {Check} check @param {Note} note
 */
function checkEngines(r, codeFiles, check, note) {
  const rows = engineRows(r.summary);
  const code = rows.Code ?? 'missing';
  if (WINDOWS) {
    check(/skipped/.test(code), `code: Semgrep skipped on Windows (${code})`);
  } else if (SEMGREP_EXPECTED) {
    check(/ran/.test(code), `code: Semgrep installed and ran (${code})`);
    check(
      codeFiles.has('app/server.py'),
      'code: command injection found in app/server.py',
    );
  } else {
    note(
      `code check NOT verified: no Python venv/pip on this machine (Semgrep: ${code})`,
    );
  }
  for (const [label, status] of Object.entries(rows)) {
    if (label === 'Code' && !SEMGREP_EXPECTED) continue;
    check(!/failed/.test(status), `engine ${label} did not fail (${status})`);
  }
}

/**
 * The `sarif-file` output points to a valid SARIF 2.1.0 file with one result per finding.
 * @param {RunResult} r @param {Check} check
 */
function checkSarif(r, check) {
  const sarifPath = r.outputs['sarif-file'] ?? '';
  /** @type {{ version?: string, runs?: { results?: unknown[] }[] } | null} */
  let sarif = null;
  try {
    sarif = JSON.parse(readFileSync(sarifPath, 'utf8'));
  } catch {
    /* asserted below */
  }
  check(
    sarif?.version === '2.1.0',
    `sarif-file output points to a valid SARIF 2.1.0 file (${sarifPath})`,
  );
  check(
    sarif?.runs?.[0]?.results?.length === r.findings.length,
    'SARIF has one result per finding',
  );
  return sarif;
}

// ---------------------------------------------------------------- scenarios
/** @type {Scenario[]} */
const scenarios = [];
/** @param {string} name @param {Scenario['run']} run */
const scenario = (name, run) => scenarios.push({ name, run });

scenario(
  'vulnerable repo, action.yml defaults: every check finds its problem',
  (check, note) => {
    const repo = path.join(work, 'vulnerable');
    const { token } = createVulnerableRepo(repo);
    const r = runAction(repo, { exclude: 'excluded/**' });
    /** @param {string} name */
    const files = (name) =>
      new Set(r.findings.filter((f) => f.check === name).map((f) => f.file));

    check(r.status === 1, `job fails at the default fail-on (exit ${r.status})`);
    check(
      Number(r.outputs['findings-count']) === r.findings.length && r.findings.length > 0,
      `findings-count output (${r.outputs['findings-count']}) matches the findings output`,
    );
    check(
      JSON.parse(r.outputs.languages ?? '[]').includes('Python'),
      'languages output lists Python',
    );

    for (const lockfile of ['package-lock.json', 'web/yarn.lock', 'api/pnpm-lock.yaml']) {
      check(
        files('dependencies').has(lockfile),
        `dependencies: lodash@4.17.20 reported in ${lockfile}`,
      );
    }
    check(
      files('secrets').has('config/settings.js'),
      'secrets: GitHub token found in config/settings.js',
    );
    check(
      files('malware').has('scripts/install.sh'),
      'malware: reverse shell found in scripts/install.sh',
    );
    check(
      !files('malware').has('excluded/install.sh'),
      'exclude input: excluded/install.sh not reported',
    );

    checkEngines(r, files('code'), check, note);
    const sarif = checkSarif(r, check);

    const everything = [
      r.stdout,
      r.stderr,
      r.summary,
      JSON.stringify(r.outputs),
      JSON.stringify(sarif),
    ];
    check(
      !everything.join('\n').includes(token),
      'the leaked token never appears in logs, summary, outputs or SARIF',
    );
  },
);

scenario('fail-on: none reports but does not fail the job', (check) => {
  const repo = path.join(work, 'vulnerable-none');
  createVulnerableRepo(repo);
  const r = runAction(repo, { 'checks': 'malware,secrets', 'fail-on': 'none' });
  check(r.status === 0, `job passes (exit ${r.status})`);
  check(r.findings.length > 0, `findings are still reported (${r.findings.length})`);
});

scenario('clean repo passes with no findings', (check) => {
  const repo = path.join(work, 'clean');
  createCleanRepo(repo);
  const r = runAction(repo, { checks: 'dependencies,secrets,malware,workflows' });
  check(r.status === 0, `job passes (exit ${r.status})`);
  check(
    r.outputs['findings-count'] === '0',
    `findings-count is 0 (${r.outputs['findings-count']})`,
  );
  check(r.summary.includes('No problems found'), 'summary says no problems were found');
  check(
    /skipped — no dependency files found/.test(r.summary),
    'dependencies skipped: no manifests',
  );
  check(
    /skipped — only runs on pull requests/.test(r.summary),
    'workflows skipped outside pull requests',
  );
});

let badRepos = 0;
/**
 * A scenario where the action must stop early with a clear error.
 * @param {StringMap} inputs
 * @param {RegExp} pattern expected `::error::` line on stdout
 * @param {string} description
 * @param {(root: string) => void} [setup]
 */
const failsWith = (inputs, pattern, description, setup = createCleanRepo) =>
  scenario(description, (check) => {
    const repo = path.join(work, `bad-${++badRepos}`);
    mkdirSync(repo);
    setup(repo);
    const r = runAction(repo, inputs);
    check(r.status === 1, `job fails (exit ${r.status})`);
    check(pattern.test(r.stdout), `clear error message matching ${pattern}`);
  });

failsWith(
  { 'fail-on': 'severe' },
  /::error::Invalid fail-on "severe"/,
  'invalid fail-on is rejected',
);
failsWith(
  { checks: 'malware,typo' },
  /::error::Unknown check "typo"/,
  'unknown check is rejected',
);
failsWith(
  { path: '../' },
  /::error::Input "path" must stay inside the workspace/,
  'path outside the workspace is rejected',
);
failsWith(
  { 'semgrep-version': '1.0.0 --index-url https://x' },
  /::error::Invalid semgrep version/,
  'malformed tool version is rejected',
);
failsWith(
  { scope: 'changed' },
  /::error::scope: changed only works on pull_request events/,
  'scope: changed outside a PR is rejected',
);
failsWith(
  {},
  /::error::No files found .*actions\/checkout/,
  'empty workspace explains the missing checkout',
  () => {},
);

// ---------------------------------------------------------------- runner
const started = Date.now();
console.log(
  `e2e: ${path.relative(ROOT, BUNDLE)} on ${process.platform}/${process.arch}, Node ${process.version}${STRICT ? ', strict' : ''}`,
);
let failures = 0;
for (const { name, run } of scenarios) {
  /** @type {{ ok: boolean, what: string }[]} */
  const results = [];
  /** @type {string[]} */
  const notes = [];
  const t = Date.now();
  try {
    run(
      (ok, what) => results.push({ ok, what }),
      (message) => notes.push(message),
    );
  } catch (error) {
    results.push({
      ok: false,
      what: `threw: ${error instanceof Error ? error.stack : String(error)}`,
    });
  }
  const failed = results.filter((r) => !r.ok);
  failures += failed.length;
  console.log(
    `\n${failed.length ? '✗' : '✓'} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`,
  );
  for (const r of results) console.log(`    ${r.ok ? '✓' : '✗'} ${r.what}`);
  for (const n of notes) console.log(`    ! ${n}`);
}

rmSync(work, { recursive: true, force: true });
const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(
  `\n${failures ? `✗ ${failures} check(s) failed` : '✓ all e2e checks passed'} in ${seconds}s`,
);
if (failures) process.exitCode = 1;
