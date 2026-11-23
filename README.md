# 🛡️ Polyglot Security Guard

**One action. Every language. Vulnerable dependencies, insecure code, leaked secrets, malicious code, and risky CI changes, all in one PR comment.**

Most security actions cover one language or one kind of problem, so teams end up wiring together 4–5 tools with 4–5 different reports. Polyglot Security Guard **detects what your repo is made of** and runs the right scanners automatically:

| Check | What it finds | Engine |
| --- | --- | --- |
| `dependencies` | Known vulnerabilities (CVE/GHSA) **and known malicious packages** in your dependencies, with the version to upgrade to | [OSV-Scanner](https://github.com/google/osv-scanner) (Google) using the [OSV.dev](https://osv.dev) database |
| `code` | Insecure code: SQL injection, XSS, command injection, weak crypto, unsafe deserialization… | [Semgrep](https://github.com/semgrep/semgrep) with rulesets auto-picked per language |
| `secrets` | API keys, tokens, passwords and private keys committed to code (the secret is never printed) | [Gitleaks](https://github.com/gitleaks/gitleaks) |
| `malware` | Code that *behaves* like malware: reverse shells, download-and-execute, obfuscated `eval`, webshells, crypto miners, credential stealers, install-time hooks, hidden Unicode (Trojan Source) | Built-in rules |
| `workflows` | PRs that make CI riskier: new write permissions, `pull_request_target`, unpinned actions, script injection | Built-in, before/after diff |

### Languages detected automatically

JavaScript · TypeScript · Python · Go · Java · Kotlin · Scala · C# · C/C++ · Rust · PHP · Ruby · Swift · Dart · Elixir · Lua · R · Solidity · Shell · PowerShell · Batch · Visual Basic · Terraform

**Dependency ecosystems:** npm/yarn/pnpm/bun · PyPI (pip, Poetry, Pipenv, uv, PDM) · Go modules · Cargo · Maven/Gradle · Composer · RubyGems · NuGet · Pub · Hex · SwiftPM · CRAN · Conan

Every manifest and lockfile below is found anywhere in the repository (monorepos included), and each finding names the file it came from:

| Ecosystem | Files |
| --- | --- |
| npm, Yarn, pnpm, Bun | `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock` (Yarn 1 and Yarn 2+), `pnpm-lock.yaml`, `bun.lock`, `package.json` |
| PyPI | `requirements.txt`, `Pipfile.lock`, `poetry.lock`, `uv.lock`, `pdm.lock`, `pyproject.toml`, `setup.py` |
| Go | `go.mod`, `go.sum` |
| crates.io | `Cargo.lock`, `Cargo.toml` |
| Maven | `pom.xml`, `build.gradle`, `build.gradle.kts`, `gradle.lockfile` |
| Packagist | `composer.lock`, `composer.json` |
| RubyGems | `Gemfile.lock`, `Gemfile` |
| NuGet | `packages.lock.json`, `deps.json`, `*.csproj` |
| Pub · Hex · SwiftPM · CRAN · Conan | `pubspec.lock` · `mix.lock` · `Package.resolved` · `renv.lock` · `conan.lock` |

Lockfiles give the most accurate results, because they pin the exact installed versions. On pull requests the default `scope: auto` reports only the files the PR changed; use `scope: all` to report every lockfile on every run.

## Quick start

`.github/workflows/security.yml`:

```yaml
name: Security

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '17 3 * * 1'   # weekly full scan catches newly disclosed CVEs

permissions:
  contents: read
  pull-requests: write     # PR comment
  security-events: write   # optional: upload to the Security tab

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          persist-credentials: false

      - id: guard
        uses: xkid1/polyglot-security-scan@v1   # better: pin to a commit SHA
        with:
          fail-on: high

      # Optional: show results in the repository's Security → Code scanning tab
      - if: always()
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: ${{ steps.guard.outputs.sarif-file }}
          category: polyglot-security-guard
```

**On pull requests**, only the files the PR changed are reported, so reviewers see the new problems and not the whole backlog. **On push and schedule**, the whole repository is scanned.

The action never runs or installs your project's code. It only reads files.

## Example PR comment

> **Detected languages:** Python (42), TypeScript (31), Shell (3)  
> **Package ecosystems:** PyPI, npm
>
> | Severity | Check | Location | Finding |
> | --- | --- | --- | --- |
> | 🟣 Critical | Dependencies | `package-lock.json` | **Known malicious package** `evil-pkg@1.0.0` (npm) — MAL-2026-1234. Remove it now and rotate any secrets on machines that installed it. |
> | 🟣 Critical | Malicious code | `scripts/deploy.sh:2` | Reverse shell: gives a remote attacker an interactive shell on the machine running this code. |
> | 🔴 High | Code | `app/db.py:4` | Detected SQL built with string formatting. (CWE-89) |
> | 🔴 High | Dependencies | `requirements.txt` | `flask@0.12` (PyPI): GHSA-562c-5r94-xh97 / CVE-2018-1000656 — Denial of Service. **Fix:** upgrade to 0.12.3. |
> | 🔴 High | Secrets | `config.js:2` | Possible leaked secret (`github-pat`). If it is real, revoke/rotate it. |
> | 🔴 High | Workflows | `.github/workflows/ci.yml` | Workflow: adds `id-token: write` — can mint OIDC tokens to publish packages. |

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `checks` | all five | Comma-separated: `dependencies, code, secrets, malware, workflows` |
| `scope` | `auto` | `auto` = changed files on PRs, everything otherwise. Or force `changed` / `all` |
| `fail-on` | `high` | Fail at this severity or above: `none`, `low`, `medium`, `high`, `critical` |
| `path` | `.` | Directory to scan (for monorepos) |
| `exclude` | | Globs to skip, e.g. `test/fixtures/**, docs/` |
| `semgrep-rules` | auto | Override Semgrep rules, e.g. `p/owasp-top-ten, ./semgrep/my-rules.yml` |
| `comment` | `true` | Post a PR comment, updated in place on each push |
| `comment-when-clean` | `false` | Also comment when nothing was found |
| `trusted-owners` | `actions,github` | Action owners the workflow check trusts more |
| `sarif-file` | `polyglot-security-guard.sarif` | Combined SARIF output path |
| `osv-scanner-version` / `gitleaks-version` / `semgrep-version` | pinned | Engine versions |

## Outputs

`languages`, `findings-count`, `critical-count`, `high-count`, `findings` (JSON), `sarif-file`.

## Severity

| Level | Examples |
| --- | --- |
| 🟣 Critical | Known malicious package, reverse shell, crypto miner, webshell, code downloaded and executed, CVSS ≥ 9 |
| 🔴 High | Leaked secret, obfuscated `eval`, SQL injection, CVSS 7–8.9, dangerous workflow change |
| 🟠 Medium | CVSS 4–6.9, unpinned third-party action, `curl … \| sh` |
| 🔵 Low | Minor issues, informational |

## False positives

- **Ignore one line:** add a `security-guard: ignore` comment on that line or the line above it.
- **Ignore paths:** `exclude: 'test/fixtures/**, examples/'`
- **Semgrep:** `# nosemgrep` comments and `.semgrepignore` work as usual.
- **Gitleaks:** a `.gitleaks.toml` or `.gitleaksignore` in your repo is respected.

## Honest limits

- No scanner catches everything. A clean report means *no known problem was found*, not *proven safe*.
- "Malicious code" findings are **patterns for a human to review**. Security tools, CTF code, and pentest scripts will trigger them on purpose.
- Dependency results are only as current as the OSV.dev database. That's why a weekly `schedule` run is recommended.
- Semgrep's free rules are pattern-based. Some deep cross-file issues need Semgrep's paid engine or CodeQL.
- Linux and macOS runners are supported. Semgrep doesn't run on Windows runners, so use `ubuntu-latest`.

## Security of this action

Every scanner binary is pinned to a version and **verified against the publisher's SHA-256 checksums** before it runs. The action refuses to run an unverified binary. Semgrep installs into an isolated Python virtual environment. The action needs only `contents: read`, plus `pull-requests: write` for comments.

## Development

```bash
yarn install
yarn check        # typecheck + lint + format:check + test
yarn test:coverage
yarn build        # clean → tsc (src) → ncc bundles src/index.ts into dist/ — commit dist/!
yarn verify:dist  # self-contained bundle + smoke run against a fixture repo
yarn e2e          # dist/ with the real scanners against generated repos (needs network)
yarn bench        # performance + ReDoS benchmarks (bench/*.bench.ts, ~80 s)
```

### Source layout

Each layer is one ES-module folder with an `index.ts` barrel, imported through its alias.
Dependencies only point downwards — `apps → libs → utils → types` — and ESLint
(`import-x/no-restricted-paths`) enforces it. Inside a layer, imports are relative and
extensionless (`'./document'`, `'../shared'`, never `.../index`).

```text
src/
├── index.ts              # entry point bundled into dist/index.js
├── apps/                 # @apps  — the GitHub Action runtime
│   └── action/           #   config (input validation), context, checks, publish, run
├── libs/                 # @libs  — domain building blocks
│   ├── detection/        #   languages, manifests, skipped dirs
│   ├── engines/          #   osv/, semgrep/, gitleaks/ (install · run · parse) + shared/
│   ├── filters/          #   inline `security-guard: ignore`
│   ├── github/           #   API: file content, PR files, PR comment
│   ├── malware/          #   pattern rules + heuristics + scanner
│   ├── report/           #   Markdown report, SARIF
│   └── workflows/        #   workflow parsing, rules, analysis
├── utils/                # @utils — generic helpers: fs, glob, severity, text, helpers/
└── types/                # @types — shared type-only declarations
tests/                    # @tests — Vitest suites mirroring src/, plus fixtures helpers
bench/                    # Vitest benchmarks: hot paths and adversarial (ReDoS) inputs
e2e/                      # end-to-end suite: dist/ + real scanners, generated test repos
```

### Security conventions

- All repository paths go through `utils/fs` (`resolveInside`, `readTextFile`), which refuses
  anything outside the scanned root and never follows symlinks.
- Path inputs (`path`, `sarif-file`) must stay inside the workspace; tool versions must be
  plain `MAJOR.MINOR.PATCH` before they reach a URL or `pip install`.
- Downloaded scanners are verified against the publisher's SHA-256 (constant-time compare).
- Parsed YAML/JSON is `unknown` until narrowed; lookup tables are `Map`s, so keys such as
  `constructor` or `__proto__` can never hit `Object.prototype`.
- Text from the scanned repo is escaped before it goes into the PR comment (table cells,
  code spans, HTML). Gitleaks' `Secret`/`Match` fields are never copied anywhere.

## Credits

The heavy lifting is done by great open-source projects: OSV-Scanner (Apache-2.0), Semgrep CE (LGPL-2.1, rules under the Semgrep Rules License), and Gitleaks (MIT). This action downloads them at run time and does not redistribute them.

## License

MIT
