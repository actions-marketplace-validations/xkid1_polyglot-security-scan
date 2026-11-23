# Pull Request

<!--
Thanks for contributing! Please read Contributing.md first.
The PR title must follow Conventional Commits, e.g. `fix(malware): ignore minified bundles`.
Security vulnerabilities go in a private advisory (SECURITY.md), not a public PR.
-->

## Summary

<!-- What changed and why. Link the issue it fixes, e.g. "Fixes #123". -->

## Change type

- [ ] Bug fix
- [ ] New or changed detection (rule, heuristic, engine)
- [ ] Security hardening
- [ ] Breaking change (removed/renamed input or output, or a default that now fails more runs)
- [ ] Refactor or maintenance
- [ ] Documentation

## Verification

CI runs typecheck, lint, format, tests with coverage, `build` + `verify:dist`, the e2e
suite on Linux/macOS/Windows and a self-scan of this repository with the committed
`dist/`. All must pass.

- [ ] `yarn check` passes locally
- [ ] `yarn build && yarn verify:dist` passes, and the rebuilt `dist/` is committed
- [ ] `yarn e2e` passes locally (real scanners against generated repos; CI runs it on Linux, macOS and Windows)
- [ ] Tests added or updated for every behavior change
- [ ] New detection rules have a positive sample **and** a "stays quiet on normal code" sample

## Review checklist

- [ ] No security default weakened (checksum verification, path containment, version
      validation, escaping of PR-comment text, secrets never printed)
- [ ] Repository files are read only through `utils/fs` (`readTextFile` / `resolveInside`)
- [ ] Untrusted JSON/YAML stays `unknown` until narrowed; lookup tables are `Map`s
- [ ] New regexes are bounded (no unbounded nested quantifiers) and have no `g`/`y` flag
      when shared
- [ ] Layering respected (`apps → libs → utils → types`); new types live in `src/types`
- [ ] Input/output changes update `action.yml` and `README.md`
- [ ] `CHANGELOG.md` has an entry under **Unreleased**
