import { clip, isRecord } from '@utils';

import { toRepoPath } from '../shared';

import type { Finding, GitleaksResult } from '@types';

/**
 * Gitleaks JSON report -> findings.
 *
 * SECURITY: only RuleID, Description, File and StartLine are read. `Secret` and `Match`
 * contain the leaked value and must never reach a finding, log, comment or SARIF file.
 */
export function parseGitleaks(json: unknown, root: string): Finding[] {
  if (!Array.isArray(json)) return [];
  return (json as unknown[]).filter(isRecord).map((raw) => {
    const r = raw as GitleaksResult;
    const rule = typeof r.RuleID === 'string' ? r.RuleID : 'secret';
    return {
      check: 'secrets',
      tool: 'gitleaks',
      severity: 'high',
      rule,
      file: toRepoPath(root, typeof r.File === 'string' ? r.File : undefined),
      line: typeof r.StartLine === 'number' ? r.StartLine : undefined,
      message: `Possible leaked secret (\`${rule}\`): ${clip(r.Description, 110)} If it is real, revoke/rotate it — deleting it from the file is not enough.`,
    };
  });
}
