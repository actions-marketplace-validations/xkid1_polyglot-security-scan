import type { CheckId, Severity } from '@types';

/** Hidden marker used to find and update the action's own PR comment. */
export const COMMENT_MARKER = '<!-- polyglot-security-guard -->';

export const TOOL_NAME = 'Polyglot Security Guard';
export const TOOL_URL = 'https://github.com/xkid1/polyglot-security-scan';

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  critical: '🟣 Critical',
  high: '🔴 High',
  medium: '🟠 Medium',
  low: '🔵 Low',
};

export const CHECK_LABEL: Readonly<Record<CheckId, string>> = {
  dependencies: 'Dependencies',
  code: 'Code',
  secrets: 'Secrets',
  malware: 'Malicious code',
  workflows: 'Workflows',
};
