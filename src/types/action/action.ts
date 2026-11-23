import type { CheckId, Severity } from '../finding';

/** Which files are scanned: only those changed in the PR, or the whole repository. */
export type Scope = 'changed' | 'all';

/** The `scope` input before `auto` is resolved. */
export type ScopeInput = Scope | 'auto';

/** The `fail-on` input. */
export type FailOn = Severity | 'none';

/** Pinned versions of the external scanners. */
export interface ToolVersions {
  readonly osv: string;
  readonly gitleaks: string;
  readonly semgrep: string;
}

/** Validated action inputs. Built once by the action's config reader. */
export interface ActionConfig {
  readonly token: string;
  readonly checks: ReadonlySet<CheckId>;
  readonly failOn: FailOn;
  readonly scope: ScopeInput;
  readonly comment: boolean;
  readonly commentWhenClean: boolean;
  readonly trustedOwners: readonly string[];
  readonly exclude: readonly string[];
  readonly semgrepRules: readonly string[];
  /** Absolute path of the directory to scan (always inside the workspace). */
  readonly root: string;
  /** Absolute path of the SARIF report (always inside the workspace). */
  readonly sarifFile: string;
  readonly versions: ToolVersions;
}

/** The parts of the `pull_request` webhook payload the action uses. */
export interface PullRequestRef {
  readonly number: number;
  readonly baseSha: string;
  readonly headSha: string;
  readonly headOwner: string;
  readonly headRepo: string;
}

/** One entry of the "list pull request files" API. */
export interface PullRequestFile {
  readonly filename: string;
  readonly status: string;
  readonly previousFilename?: string | undefined;
}

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}
