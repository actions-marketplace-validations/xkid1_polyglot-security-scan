# Contributing

Thanks for helping make Polyglot Security Guard better! Bug reports, false-positive
reports, new detection rules, documentation fixes and code are all welcome.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first. **Security vulnerabilities go
in a private advisory, not an issue or PR**: see [SECURITY.md](SECURITY.md).

## Ways to help

- **Report a false positive or a missed problem**: open a
  [bug report](https://github.com/xkid1/polyglot-security-scan/issues/new/choose) with the
  smallest code sample that shows it. These are the most useful reports we get.
- **Suggest a feature**: open a feature request and describe the problem first.
- **Improve the docs**: typo fixes need no issue; just open a PR.
- **Write code**: for anything bigger than a small fix, open an issue first so we can
  agree on the approach before you spend time on it.

## Development setup

You need **Node 24+** (see `.nvmrc`) and **Yarn 4**, provided by Corepack:

```bash
corepack enable
yarn install
yarn check          # typecheck + lint + format:check + test
```

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `yarn test`          | Unit tests (Vitest)                                                  |
| `yarn test:coverage` | Tests with the coverage thresholds CI enforces                       |
| `yarn lint`          | ESLint (type-aware, security rules, layer boundaries)                |
| `yarn format`        | Prettier                                                             |
| `yarn build`         | Type-check `src/`, then bundle `src/index.ts` into `dist/` with ncc  |
| `yarn verify:dist`   | Check the bundle is self-contained and smoke-run it                  |
| `yarn e2e`           | Run `dist/` with the real scanners against generated repos (network) |
| `yarn bench`         | Performance and ReDoS benchmarks                                     |

`yarn e2e` needs a Python with `venv` and `pip` to install Semgrep. Without it, the suite
reports the code check as "not verified"; CI always runs it in full.

## Project layout

```text
src/
├── index.ts     entry point, bundled into dist/index.js
├── apps/        @apps  — the action runtime: inputs, pipeline, outputs
├── libs/        @libs  — detection, engines, malware, workflows, report, filters, github
├── utils/       @utils — generic helpers: fs, glob, severity, text, helpers
└── types/       @types — type-only declarations
tests/           unit tests mirroring src/
bench/           benchmarks, including adversarial (ReDoS) inputs
e2e/             end-to-end suite
```

- **Layers only depend downwards**: `apps → libs → utils → types`. ESLint enforces it.
- **Imports**: between layers use the alias (`import { clip } from '@utils'`); inside a
  layer use relative, extensionless paths (`'./document'`, `'../shared'`), never
  `.../index`.
- **One focused module per file**; each folder exposes its public API through `index.ts`,
  which only re-exports.

## Security rules for code

This action reads untrusted repositories with a GitHub token, so a few rules are firm:

- Read repository files **only** through `readTextFile` / `resolveInside` in `utils/fs`.
- Treat parsed JSON/YAML and tool output as `unknown` and narrow it before use. Use `Map`
  for lookup tables keyed by untrusted strings, never plain objects.
- Escape anything from the scanned repository with `escapeTableCell` / `escapeCodeSpan`
  before it goes into the PR comment.
- Never copy a secret's value (Gitleaks `Secret` / `Match`) anywhere.
- New downloads must be pinned and checksum-verified; new inputs must be validated in
  `src/apps/action/config.ts`.
- Regular expressions must not have unbounded nested or overlapping quantifiers. Shared
  regexes must not use the `g` or `y` flag.

## Adding a detection rule

1. Add the rule to `src/libs/malware/rules.ts` (or a heuristic to `heuristics.ts`), with a
   clear message that tells a reviewer what to look for.
2. Add a **positive** sample to "fire on malicious samples" and make sure the "stay quiet
   on normal code" test still passes; add a benign look-alike there if one exists.
3. If you added or changed a regex, add an adversarial input to `bench/malware.bench.ts`
   and compare `yarn bench` before and after. Time must grow linearly with input size.

New languages and package ecosystems go in `src/libs/detection/` (`languages.ts`,
`manifests.ts`), with a test in `tests/unit/libs/detection.test.ts` and a row in the
README's ecosystem table.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change, with tests. Keep the coverage thresholds green.
3. If you changed anything under `src/`, run `yarn build` and **commit the rebuilt
   `dist/`**: users run `dist/index.js` directly, and CI fails if it is out of date.
4. Add an entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
5. Use a [Conventional Commits](https://www.conventionalcommits.org/) PR title, for
   example `fix(malware): ignore minified bundles` or `feat(detection): support Bazel`.
   Common scopes: `action`, `engines`, `malware`, `workflows`, `detection`, `report`,
   `types`, `utils`, `deps`.
6. Fill in the PR template checklist. CI runs lint, typecheck, format, tests, the build
   check, the end-user suite on Ubuntu and a self-scan.

## Releases (maintainers)

See [.github/CI_BUILD_STRATEGY.md](.github/CI_BUILD_STRATEGY.md#releasing).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
