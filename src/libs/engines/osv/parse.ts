// OSV-Scanner JSON -> findings. Vulnerabilities are reported per alias group, so one
// GHSA/CVE pair becomes one finding. Known-malicious packages (MAL-*) are critical.
import { asText, clip, unique } from '@utils';

import { toRepoPath } from '../shared';

import type {
  Finding,
  OsvGroup,
  OsvOutput,
  OsvPackageResult,
  OsvVulnerability,
  Severity,
} from '@types';

function cvssToSeverity(score: string | undefined): Severity | null {
  const n = Number.parseFloat(score ?? '');
  if (Number.isNaN(n)) return null;
  if (n >= 9) return 'critical';
  if (n >= 7) return 'high';
  if (n >= 4) return 'medium';
  return 'low';
}

const TEXT_SEVERITY: ReadonlyMap<string, Severity> = new Map([
  ['CRITICAL', 'critical'],
  ['HIGH', 'high'],
  ['MODERATE', 'medium'],
  ['MEDIUM', 'medium'],
  ['LOW', 'low'],
]);

const textSeverity = (value: unknown): Severity | undefined =>
  TEXT_SEVERITY.get(asText(value).toUpperCase());

function fixedVersions(
  vuln: OsvVulnerability,
  packageName: string | undefined,
): string[] {
  const fixes = new Set<string>();
  for (const affected of vuln.affected ?? []) {
    const name = affected.package?.name;
    if (name && packageName && name !== packageName) continue;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) if (event.fixed) fixes.add(event.fixed);
    }
  }
  return [...fixes];
}

const firstNonEmpty = (...values: (string | undefined)[]): string | undefined =>
  values.find((v) => v !== undefined && v !== '');

/** The id to show: MAL-/GHSA- id first, then the CVE, without duplicates. */
function displayId(aliases: readonly string[], fallback: string | undefined): string {
  const primary =
    aliases.find((a) => a.startsWith('MAL-') || a.startsWith('GHSA-')) ?? fallback;
  const cve = aliases.find((a) => a.startsWith('CVE-'));
  return unique([primary, cve].filter((id): id is string => Boolean(id))).join(' / ');
}

type PackageInfo = NonNullable<OsvPackageResult['package']>;

/** One alias group with its resolved vulnerability records. */
interface Group {
  readonly ids: readonly string[];
  readonly members: readonly OsvVulnerability[];
  readonly aliases: readonly string[];
  readonly maxSeverity: string | undefined;
}

function resolveGroup(
  group: OsvGroup,
  vulns: ReadonlyMap<string, OsvVulnerability>,
): Group {
  const ids = group.ids ?? [];
  const members = ids
    .map((id) => vulns.get(id))
    .filter((v): v is OsvVulnerability => v !== undefined);
  const aliases = unique([
    ...ids,
    ...(group.aliases ?? []),
    ...members.flatMap((m) => m.aliases ?? []),
  ]);
  return { ids, members, aliases, maxSeverity: group.max_severity };
}

const packageLabel = (pkg: PackageInfo): string =>
  `\`${pkg.name ?? 'unknown'}@${pkg.version ?? 'unknown'}\` (${pkg.ecosystem ?? 'unknown'})`;

/** CVSS score first, then the advisory database's text severity, then `medium`. */
const groupSeverity = (g: Group): Severity =>
  cvssToSeverity(g.maxSeverity) ??
  g.members
    .map((m) => textSeverity(m.database_specific?.severity))
    .find((s) => s !== undefined) ??
  'medium';

function fixAdvice(g: Group, packageName: string | undefined): string {
  const fixes = unique(g.members.flatMap((m) => fixedVersions(m, packageName)));
  return fixes.length
    ? ` **Fix:** upgrade to ${fixes.slice(0, 3).join(' or ')}.`
    : ' No fixed version yet.';
}

function groupFinding(g: Group, pkg: PackageInfo, file: string): Finding {
  const main = g.members[0];
  const shownId = displayId(g.aliases, main?.id ?? g.ids[0]);
  const base = { check: 'dependencies', tool: 'osv-scanner', file } as const;

  if (g.aliases.some((id) => id.startsWith('MAL-'))) {
    return {
      ...base,
      severity: 'critical',
      rule: 'malicious-package',
      message: `**Known malicious package** ${packageLabel(pkg)} — ${shownId}. Remove it now and rotate any secrets on machines that installed it.`,
    };
  }

  const summary = clip(
    firstNonEmpty(main?.summary, main?.details) ?? 'vulnerability',
    160,
  );
  return {
    ...base,
    severity: groupSeverity(g),
    rule: main?.id ?? g.ids[0] ?? 'vulnerability',
    message: `${packageLabel(pkg)}: ${shownId} — ${summary}.${fixAdvice(g, pkg.name)}`,
  };
}

export function parseOsv(json: OsvOutput | null | undefined, root: string): Finding[] {
  const findings: Finding[] = [];
  for (const result of json?.results ?? []) {
    const file = toRepoPath(root, result.source?.path);
    for (const pkg of result.packages ?? []) {
      const vulns = new Map((pkg.vulnerabilities ?? []).map((v) => [v.id, v]));
      const groups: readonly OsvGroup[] = pkg.groups?.length
        ? pkg.groups
        : [...vulns.keys()].map((id) => ({ ids: [id] }));
      for (const group of groups) {
        findings.push(groupFinding(resolveGroup(group, vulns), pkg.package ?? {}, file));
      }
    }
  }
  return findings;
}
