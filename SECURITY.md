# Security Policy

Polyglot Security Guard runs inside other people's CI pipelines, with access to their
source code and a GitHub token. A vulnerability in the action itself can affect every
repository that uses it, so security reports get top priority.

## Supported versions

| Version                              | Supported                      |
| ------------------------------------ | ------------------------------ |
| `v1` (latest `1.x.y` release)        | ✅ security fixes              |
| Pinned commit SHA of a `1.x` release | ✅ upgrade to the latest `1.x` |
| Anything older than the latest `1.x` | ❌                             |

Fixes ship as a new `1.x.y` release and the floating `v1` tag is moved to it. If you pin
the action to a commit SHA (recommended), update the SHA when an advisory is published.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/xkid1/polyglot-security-scan/security/advisories/new)**
(repository **Security** tab → **Report a vulnerability**).

A good report includes:

- what an attacker can do, and what they need first (for example "anyone who can open a
  pull request");
- the action version or commit SHA, and the workflow configuration (`with:` inputs);
- steps or a minimal repository/workflow that reproduces it;
- any logs, **with real secrets removed**.

### What happens next

These are goals for a project maintained by one person, not contractual guarantees:

| Step                                 | Target                      |
| ------------------------------------ | --------------------------- |
| Acknowledge the report               | within 3 business days      |
| Confirm or reject it, with reasoning | within 10 business days     |
| Release a fix for a confirmed issue  | as fast as severity demands |

You'll be kept up to date in the advisory thread. Once a fix is released, the advisory is
published with a CVE where appropriate, and you're credited unless you prefer not to be.

## Scope

**In scope**: problems in this action's own code or release process, for example:

- reading or writing files outside the scanned repository or the workspace;
- a secret found by a scan appearing in logs, the job summary, the PR comment, outputs or
  the SARIF file;
- running a downloaded binary without verifying its checksum, or any way to make the
  action execute attacker-controlled code;
- injection through repository content into the PR comment, annotations or outputs;
- input validation bypasses (`path`, `sarif-file`, tool versions, `checks`);
- denial of service from hostile repository content (for example a regex that takes
  super-linear time, see `bench/`);
- a way to make a check silently report "no problems" when it should fail;
- the token being used for more than reading PR files and writing the PR comment.

**Out of scope**: please use a regular issue for these:

- false positives or false negatives of the heuristics or the scanners (they are not
  vulnerabilities, but reports are welcome);
- vulnerabilities in OSV-Scanner, Semgrep or Gitleaks themselves: report them to those
  projects;
- findings that require an attacker who can already push to your default branch or edit
  your workflow files;
- missing hardening in _your_ workflow (see below).

## Safe harbor

Good-faith security research is welcome. If you follow this policy, avoid privacy
violations and service disruption, only test against repositories you own or have
permission to test, and give a reasonable time to fix before disclosure, no action will be
taken against you.

## How the action protects you

- **Verified binaries**: OSV-Scanner and Gitleaks are pinned and checked against the
  publisher's SHA-256 checksums (constant-time comparison); the action refuses to run an
  unverified binary. Semgrep is installed into an isolated virtual environment.
- **Validated inputs**: `path` and `sarif-file` must stay inside the workspace; tool
  versions must be plain `MAJOR.MINOR.PATCH`, so they can't smuggle a URL or pip option.
- **Contained file access**: repository files are read without following symlinks and
  never outside the scanned root.
- **No secret leaks**: Gitleaks runs with `--redact`, and the secret value is never copied
  into any finding, log, comment or SARIF file.
- **Safe reporting**: text from the scanned repository is escaped before it is put into
  the PR comment; only the action's own bot comment is ever updated.
- **Hostile input**: every pattern runs in linear time on adversarial input, and parsed
  YAML/JSON is treated as untrusted (alias limits, no prototype lookups).

## Hardening your workflow

- Pin the action to a full commit SHA, not just `@v1`.
- Give the job only `contents: read` (plus `pull-requests: write` if you want the
  comment).
- Run it on `pull_request`, never on `pull_request_target` with a checkout of the PR head.
- Check out with `persist-credentials: false`.
