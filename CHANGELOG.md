# Changelog

All notable changes to this action are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

## 1.0.0

First public release.

### Checks

- **Dependencies**: known vulnerabilities and known-malicious packages via OSV-Scanner,
  across npm/Yarn/pnpm/Bun, PyPI, Go, Cargo, Maven/Gradle, Composer, RubyGems, NuGet, Pub,
  Hex, SwiftPM, CRAN and Conan manifests and lockfiles, with the version to upgrade to.
- **Code**: Semgrep with rulesets picked automatically for the detected languages
  (skipped on Windows runners, which Semgrep does not support).
- **Secrets**: Gitleaks; secret values are never printed, commented or written to SARIF.
- **Malicious code**: built-in heuristics for reverse shells, droppers, obfuscated
  payloads, miners, credential theft, Trojan Source and install-time hooks.
- **Workflows**: risky changes in pull requests: dangerous triggers, new write
  permissions, unpinned or branch-pinned actions, script injection, `secrets: inherit` and
  self-hosted runners.

### Reporting

- PR comment (updated in place), job summary, inline annotations and a combined SARIF
  file for the Security tab; outputs for counts, languages and all findings.
- `scope: auto` scans only files changed in a pull request; inline
  `security-guard: ignore` comments and `exclude` globs silence findings.

### Security

- Scanner binaries are pinned and verified against the publisher's SHA-256 checksums.
- Path inputs must stay inside the workspace; tool versions must be `MAJOR.MINOR.PATCH`.
- Repository files are read without following symlinks or leaving the scanned root.
- Untrusted text is escaped before it is added to the PR comment.
- All regular expressions run in linear time on hostile input (ReDoS-tested).
