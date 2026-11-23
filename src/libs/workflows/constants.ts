import type { Severity } from '@types';

/** A severity plus the reason shown to the user. */
export interface Reason {
  readonly severity: Severity;
  readonly why: string;
}

/** Triggers that let less-trusted actors start privileged runs. */
export const DANGEROUS_TRIGGERS: ReadonlyMap<string, Reason> = new Map([
  [
    'pull_request_target',
    {
      severity: 'high',
      why: 'Runs in the context of the base repo with a write token and secrets, even for PRs from forks.',
    },
  ],
  [
    'workflow_run',
    {
      severity: 'medium',
      why: 'Runs privileged code after another workflow, which may have been started by untrusted code.',
    },
  ],
  [
    'issue_comment',
    {
      severity: 'medium',
      why: 'Anyone who can comment on an issue or PR can start this workflow.',
    },
  ],
  [
    'pull_request_review_comment',
    { severity: 'low', why: 'Anyone who can review can start this workflow.' },
  ],
  [
    'discussion_comment',
    {
      severity: 'low',
      why: 'Anyone who can comment in Discussions can start this workflow.',
    },
  ],
]);

/** Write access to these scopes is especially dangerous if the job is compromised. */
export const WRITE_SCOPE_RISK: ReadonlyMap<string, Reason> = new Map([
  [
    'id-token',
    {
      severity: 'high',
      why: 'can mint OIDC tokens to publish packages or log in to cloud accounts',
    },
  ],
  [
    'contents',
    { severity: 'high', why: 'can push code, create releases and change tags' },
  ],
  ['packages', { severity: 'high', why: 'can publish or overwrite packages' }],
  ['actions', { severity: 'high', why: 'can change workflow runs and caches' }],
  ['security-events', { severity: 'medium', why: 'can dismiss code scanning alerts' }],
  ['deployments', { severity: 'medium', why: 'can create deployments' }],
  [
    'pull-requests',
    { severity: 'medium', why: 'can approve, edit or merge-related PR actions' },
  ],
  ['issues', { severity: 'low', why: 'can edit issues' }],
  ['statuses', { severity: 'low', why: 'can set commit statuses' }],
  ['checks', { severity: 'low', why: 'can create check runs' }],
]);

/** Fallback for write scopes not listed in {@link WRITE_SCOPE_RISK}. */
export const UNKNOWN_WRITE_SCOPE: Reason = {
  severity: 'medium',
  why: 'new write access',
};

/**
 * `${{ … }}` expressions an attacker controls (PR titles, branch names, comments…).
 * Using them directly inside `run:` or a github-script `script:` allows injection.
 * Global flag: use only with `String.prototype.matchAll`.
 *
 * ReDoS: every gap is `[^{}]*`, never `[^}]*`. With `[^}]*`, each unclosed `${{` scanned
 * to the end of the file and backtracked, so a PR could stall the check with a workflow
 * full of unclosed expressions (quadratic time; see bench/workflows.bench.ts). Stopping at
 * `{` ends each scan at the next opening, which keeps matching linear.
 */
export const UNTRUSTED_EXPRESSION =
  /\$\{\{[^{}]*\bgithub\.(?:head_ref|event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label|head\.repo\.default_branch)|comment\.body|review\.body|review_comment\.body|discussion\.(?:title|body)|head_commit\.(?:message|author\.(?:name|email))|commits[^{}]*\.(?:message|author\.(?:name|email))|pages[^{}]*\.page_name|workflow_run\.(?:head_branch|head_commit\.message|display_title)))\b[^{}]*\}\}/g;

/** A full 40-character commit SHA. */
export const COMMIT_SHA = /^[0-9a-f]{40}$/i;

/** Refs that are almost certainly branches rather than tags. */
export const BRANCH_LIKE_REFS: ReadonlySet<string> = new Set([
  'main',
  'master',
  'head',
  'dev',
  'develop',
  'trunk',
  'latest',
]);

export const DEFAULT_TRUSTED_OWNERS: readonly string[] = ['actions', 'github'];

/** YAML parser limits for untrusted workflow files (guards against alias "billion laughs"). */
export const YAML_LIMITS = { maxAliasCount: 100, prettyErrors: false } as const;
