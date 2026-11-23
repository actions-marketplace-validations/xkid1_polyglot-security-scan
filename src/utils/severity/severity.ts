import type { FailOn, Severity } from '@types';

/** All severities, least severe first. */
export const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high', 'critical'];

/** Numeric rank of each severity; a higher number is more severe. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Sort comparator: most severe first. */
export const bySeverityDesc = (a: Severity, b: Severity): number =>
  SEVERITY_RANK[b] - SEVERITY_RANK[a];

/** Whether a finding of `severity` should fail the run for the given `fail-on` input. */
export function meetsThreshold(severity: Severity, failOn: FailOn): boolean {
  if (failOn === 'none') return false;
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[failOn];
}

/** Zero-initialised count per severity. */
export const emptySeverityCounts = (): Record<Severity, number> => ({
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
});
