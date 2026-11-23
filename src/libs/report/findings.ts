import { bySeverityDesc, emptySeverityCounts } from '@utils';

import type { Finding, Severity } from '@types';

/** Most severe first, then by check, file and line, for a stable order. */
export function sortFindings<T extends Finding>(findings: readonly T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      bySeverityDesc(a.severity, b.severity) ||
      a.check.localeCompare(b.check) ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

/** Drop exact duplicates (same tool, rule, location and message). */
export function dedupe<T extends Finding>(findings: readonly T[]): T[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = JSON.stringify([f.tool, f.rule, f.file, f.line ?? null, f.message]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts = emptySeverityCounts();
  for (const f of findings) counts[f.severity]++;
  return counts;
}
