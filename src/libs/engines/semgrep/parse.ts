import { asText, clip } from '@utils';

import { toRepoPath } from '../shared';

import type { Finding, SemgrepOutput, Severity } from '@types';

const SEVERITY: ReadonlyMap<string, Severity> = new Map([
  ['CRITICAL', 'critical'],
  ['ERROR', 'high'],
  ['HIGH', 'high'],
  ['WARNING', 'medium'],
  ['MEDIUM', 'medium'],
]);

const semgrepSeverity = (value: unknown): Severity =>
  SEVERITY.get(asText(value).toUpperCase()) ?? 'low';

export function parseSemgrep(
  json: SemgrepOutput | null | undefined,
  root: string,
): Finding[] {
  return (json?.results ?? []).map((result) => {
    const rawCwe = result.extra?.metadata?.cwe;
    const cwe = typeof rawCwe === 'string' ? rawCwe : rawCwe?.[0];
    const rule = result.check_id ?? 'semgrep';
    const shortRule = rule.split('.').at(-1) ?? rule;
    return {
      check: 'code',
      tool: 'semgrep',
      severity: semgrepSeverity(result.extra?.severity),
      rule,
      file: toRepoPath(root, result.path),
      line: result.start?.line,
      message: `${clip(result.extra?.message, 240)}${cwe ? ` (${clip(cwe, 60)})` : ''} [\`${shortRule}\`]`,
    };
  });
}
