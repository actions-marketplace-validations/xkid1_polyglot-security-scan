# CI, build and repository automation

How the GitHub Actions workflows for `xkid1/polyglot-security-scan` fit together, what
each check runs, and the one-time repository settings they rely on.

## Principles

- **The committed `dist/` is what users run.** `action.yml` runs `dist/index.js` straight
  from the repository, so every runtime dependency (`@actions/*`, `yaml`) is bundled into
  it and the committed bundle must match a fresh build.
- **Security defaults are tested, not trusted.** Path containment, version validation,
  checksum verification, PR-comment escaping and secret redaction all have negative tests,
  and coverage thresholds keep them from silently disappearing.
- **Dogfooding.** The action scans this repository on every PR with the committed `dist/`.
- **Same commands locally and in CI.** Every check is a package script, so `yarn check`,
  `yarn build` and `yarn verify:dist` reproduce CI on your machine.
- **Least privilege.** Workflows default to `contents: read`, checkouts use
  `persist-credentials: false`, jobs request write scopes only where they need them, and
  `pull_request_target` workflows never check out PR code.

## Shared building blocks

| Action                    | What it does                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/actions/setup`   | Node from `.nvmrc` (or the `node-version` input), Yarn via Corepack, Yarn cache, `yarn install --immutable` (install scripts disabled in `.yarnrc.yml`) |
| `.github/actions/changes` | Outputs `code=false` when a PR or push only changes docs/config (`*.md`, `*.yml` outside `.github/`, `docs/`), so jobs skip themselves                  |

Skipped jobs count as passed for required status checks, so docs-only PRs can still merge.

## Build output

`yarn build` runs `clean → tsc -p tsconfig.build.json (type-check src/) → ncc` and writes
a single self-contained ESM bundle to `dist/index.js` (plus `dist/licenses.txt`). ncc
resolves the `@apps`/`@libs`/`@types`/`@utils` aliases from `tsconfig.json`.

`yarn verify:dist` then checks that:

1. `action.yml` runs `dist/index.js` on Node 24 or newer;
2. the bundle has no unresolved alias and imports nothing but Node built-ins;
3. a smoke run against a fixture repository finds the planted reverse shell, writes the
   SARIF file and fails the job, without network access.

## Pull request checks

| Workflow                | Check name             | Runs                                                                                                                       | Required    |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ci.yml`                | `Lint`                 | `yarn lint` (type-aware, security, import-x layering)                                                                      | yes         |
| `ci.yml`                | `Typecheck`            | `yarn typecheck`                                                                                                           | yes         |
| `ci.yml`                | `Format`               | `yarn format:check`                                                                                                        | optional    |
| `ci.yml`                | `Self-scan`            | This action (`uses: ./`) on its own repository, `fail-on: high`                                                            | yes         |
| `test.yml`              | `Test`                 | `yarn test:coverage` (85% lines/functions/statements, 75% branches)                                                        | yes         |
| `build.yml`             | `Build`                | `yarn build` + `yarn verify:dist`, and fails if the committed `dist/` is out of date                                       | yes         |
| `e2e.yml`               | `Bundle (…)`, `Action` | `yarn e2e` (strict) on Ubuntu, macOS and Windows against the committed `dist/`, and the action via `uses: ./`; also weekly | yes         |
| `codeql.yml`            | `Analyze (…)`          | CodeQL for TypeScript/JavaScript and for the workflows themselves                                                          | recommended |
| `dependency-review.yml` | `Dependency review`    | Fails when a PR adds a dependency version with a known moderate+ vulnerability                                             | yes         |
| `pr-title.yml`          | `PR title`             | Conventional Commits title (it becomes the release-notes entry)                                                            | optional    |

## End-to-end suite (`e2e.yml`)

`yarn e2e` (`e2e/run.mjs`) runs `dist/index.js` exactly as the runner does: `INPUT_*`
variables built from the defaults in `action.yml`, `GITHUB_OUTPUT` and
`GITHUB_STEP_SUMMARY` files, and the real scanners downloaded and checksum-verified. Test
repositories are generated at runtime by `e2e/fixtures.mjs` (a random fake token, a
reverse shell assembled from parts), so nothing that trips push protection or the
self-scan is committed. It checks that:

1. a vulnerable repo gets dependency findings in `package-lock.json`, `yarn.lock` and
   `pnpm-lock.yaml`, plus the secret, the malware and Semgrep's finding (skipped on
   Windows); the `exclude` input works; every output is set; the SARIF file is valid; and
   the secret never leaks into logs, summary, outputs or SARIF;
2. `fail-on: none` and a clean repo pass;
3. invalid inputs, a `path` outside the workspace, a malformed tool version,
   `scope: changed` outside a PR and an empty workspace all fail with a clear message.

Locally, a machine without a Python venv cannot install Semgrep, and the suite says the
code check was not verified. CI runs with `E2E_STRICT=1`, where that is a failure.

The `Action` job then uses the action through `uses: ./`, which also tests `action.yml`
(input defaults, output mapping) and, on pull requests, the GitHub API calls of the
workflows check. The weekly run catches breakage from outside the repository: a renamed
release asset or checksum file, an OSV API change, or a moved Semgrep ruleset.

## Releasing

1. Move the CHANGELOG's **Unreleased** entries under a `## X.Y.Z` heading, set `version`
   in `package.json` and `ACTION_VERSION` in `src/apps/action/constants.ts` to `X.Y.Z`,
   run `yarn build` and commit `dist/`. Merge to `main`.
2. Tag the release and move the major tag users reference:

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   git tag -f vX && git push -f origin vX
   ```

3. Create the GitHub Release with generated notes (grouped by `.github/release.yml`), and
   publish it to the Marketplace from the release form.

Users who pin to a commit SHA (recommended) are not affected by moving the major tag.

## Repository automation

| Workflow                    | Trigger             | What it does                                                                                                                                                                  |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr-labeler.yml`            | PR opened/updated   | Labels PRs from the files they change (`labeler.yml`): `action`, `engines`, `checks`, `report`, `types`, `utils`, `source`, `tests`, `dist`, `ci`, `documentation`, `tooling` |
| `pr-title.yml`              | PR opened/edited    | Enforces Conventional Commits titles                                                                                                                                          |
| `pr-welcome.yml`            | First issue or PR   | Welcomes first-time contributors and points them to the guidelines                                                                                                            |
| `dependabot-auto-merge.yml` | Dependabot PRs      | Auto-merges minor/patch devDependency and GitHub Actions updates once all required checks pass                                                                                |
| `stale.yml`                 | Daily               | Marks issues/PRs stale after 60 days without activity and closes them 14 days later (`bug` and `security` issues are exempt)                                                  |
| `codeql.yml`                | PRs, `main`, weekly | CodeQL security and quality analysis                                                                                                                                          |
| `scorecard.yml`             | `main`, weekly      | OpenSSF Scorecard for supply-chain practices                                                                                                                                  |

**Dependabot** (`dependabot.yml`) proposes npm and GitHub Actions updates weekly, grouped,
and waits 5 days after a release before proposing it. Runtime dependency updates change
the bundle, so they need a rebuilt `dist/` and are never auto-merged.

## One-time repository settings

1. **Branch ruleset for `main`**: **Settings → Rules → Rulesets → New branch ruleset**.
   Target the default branch, set **Enforcement status** to **Active**, and enable:
   - **Require a pull request before merging**
   - **Require status checks to pass**, adding `Lint`, `Typecheck`, `Self-scan`, `Test`,
     `Build`, the three `Bundle (…)` checks, `Action` and `Dependency review` (optionally
     `Format`, `PR title` and the CodeQL checks). A check can only be selected after it
     has run once, so open a PR first.
2. **Settings → General → Allow auto-merge**, for Dependabot auto-merge.
3. **Settings → Code security**: turn on **Private vulnerability reporting** (used by
   `SECURITY.md`), Dependabot alerts and the dependency graph.
4. **Labels**: create the labels `labeler.yml` applies, plus `security` and
   `skip-changelog`.

## Local validation

```bash
yarn check          # typecheck + lint + format:check + test
yarn test:coverage  # tests with the coverage thresholds
yarn build && yarn verify:dist
yarn e2e            # dist/ + real scanners against generated repos (needs network)
yarn bench             # benchmarks; compare against main before merging a regex change
```
