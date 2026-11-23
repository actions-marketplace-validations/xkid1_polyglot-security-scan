// Markdown report for the PR comment and the job summary. Everything that can come from
// the scanned repository (paths, messages, notes) is escaped before it is inserted.
import { escapeCodeSpan, escapeTableCell } from '@utils';

import { countBySeverity, sortFindings } from './findings';
import { CHECK_LABEL, COMMENT_MARKER, SEVERITY_LABEL, TOOL_NAME } from './labels';

import type { EngineStatus, Finding, ReportInput, Severity } from '@types';

const MAX_LANGUAGES_SHOWN = 12;

const location = (f: Finding): string => (f.line ? `${f.file}:${f.line}` : f.file);

function header({ languages, ecosystems, scope }: ReportInput): string[] {
  const shown = languages
    .slice(0, MAX_LANGUAGES_SHOWN)
    .map((l) => `${l.name} (${l.files})`);
  const more = languages.length > MAX_LANGUAGES_SHOWN ? ', …' : '';
  const langs = languages.length ? shown.join(', ') + more : 'none detected';
  const ecos = ecosystems.length ? ecosystems.map((e) => e.name).join(', ') : 'none';
  return [
    COMMENT_MARKER,
    `## 🛡️ ${TOOL_NAME}`,
    '',
    `**Detected languages:** ${escapeTableCell(langs)}  `,
    `**Package ecosystems:** ${escapeTableCell(ecos)}  `,
    `**Scope:** ${scope === 'changed' ? 'files changed in this PR' : 'whole repository'}`,
    '',
  ];
}

function findingsTable(findings: readonly Finding[], maxRows: number): string[] {
  if (findings.length === 0) return ['✅ **No problems found.**', ''];

  const counts = countBySeverity(findings);
  const summary = (Object.entries(counts) as [Severity, number][])
    .filter(([, n]) => n > 0)
    .map(([severity, n]) => `${SEVERITY_LABEL[severity]} **${n}**`)
    .join(' · ');
  const lines = [
    `Found **${findings.length}** issue(s): ${summary}`,
    '',
    '| Severity | Check | Location | Finding |',
    '| --- | --- | --- | --- |',
  ];
  const sorted = sortFindings(findings);
  for (const f of sorted.slice(0, maxRows)) {
    const where = escapeTableCell(escapeCodeSpan(location(f)));
    lines.push(
      `| ${SEVERITY_LABEL[f.severity]} | ${CHECK_LABEL[f.check]} | \`${where}\` | ${escapeTableCell(f.message)} |`,
    );
  }
  if (sorted.length > maxRows) {
    lines.push(
      '',
      `…and **${sorted.length - maxRows} more**. See the job summary, the SARIF file, or the Security tab.`,
    );
  }
  lines.push('');
  return lines;
}

function enginesTable(engines: readonly EngineStatus[]): string[] {
  const lines = [
    '<details><summary>Checks that ran</summary>',
    '',
    '| Check | Engine | Status |',
    '| --- | --- | --- |',
  ];
  for (const e of engines) {
    const note = e.note ? ` — ${escapeTableCell(e.note)}` : '';
    lines.push(
      `| ${CHECK_LABEL[e.check]} | ${escapeTableCell(e.tool)} | ${escapeTableCell(e.status)}${note} |`,
    );
  }
  lines.push('', '</details>', '');
  return lines;
}

const DISCLAIMER =
  '<sub>Automated scanners miss things and sometimes raise false alarms. "Malicious code" findings are patterns for a human to review, not proof of malware.</sub>';

export function renderReport(input: ReportInput): string {
  return [
    ...header(input),
    ...findingsTable(input.findings, input.maxRows ?? 50),
    ...enginesTable(input.engines),
    DISCLAIMER,
  ].join('\n');
}
