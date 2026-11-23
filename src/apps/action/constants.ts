import type { CheckId, FailOn, ScopeInput } from '@types';

/** Reported in the SARIF file. Keep in sync with package.json. */
export const ACTION_VERSION = '1.0.0';

export const ALL_CHECKS: readonly CheckId[] = [
  'dependencies',
  'code',
  'secrets',
  'malware',
  'workflows',
];
export const FAIL_ON_VALUES: readonly FailOn[] = [
  'none',
  'low',
  'medium',
  'high',
  'critical',
];
export const SCOPE_VALUES: readonly ScopeInput[] = ['auto', 'changed', 'all'];

export const DEFAULT_SARIF_FILE = 'polyglot-security-guard.sarif';

/** Annotations are capped by GitHub; the rest are in the summary and SARIF. */
export const MAX_ANNOTATIONS = 50;
export const MAX_SUMMARY_ROWS = 300;
export const MAX_COMMENT_ROWS = 50;
