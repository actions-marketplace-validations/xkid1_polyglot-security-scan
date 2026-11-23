// Everything the action emits: annotations, job summary, SARIF file, outputs, PR comment.
import { writeFile } from 'node:fs/promises';

import * as core from '@actions/core';

import {
  COMMENT_MARKER,
  countBySeverity,
  renderReport,
  toSarif,
  upsertComment,
} from '@libs';
import { errorMessage, errorStatus } from '@utils';

import {
  ACTION_VERSION,
  MAX_ANNOTATIONS,
  MAX_COMMENT_ROWS,
  MAX_SUMMARY_ROWS,
} from './constants';

import type { ScanPlan } from './checks';
import type { EngineStatus, Finding, ReportInput } from '@types';

/** Inline annotations on the PR diff for the most severe findings. */
export function annotate(findings: readonly Finding[]): void {
  for (const f of findings.slice(0, MAX_ANNOTATIONS)) {
    const props: core.AnnotationProperties = { title: `${f.check}: ${f.rule}` };
    if (f.file) props.file = f.file;
    if (f.line) props.startLine = f.line;
    const message = f.message.replace(/[`*]/g, '');
    if (f.severity === 'critical' || f.severity === 'high') core.error(message, props);
    else if (f.severity === 'medium') core.warning(message, props);
    else core.notice(message, props);
  }
}

export async function writeSarif(
  file: string,
  findings: readonly Finding[],
): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- sarifFile is validated to stay inside the workspace (config.ts)
  await writeFile(file, JSON.stringify(toSarif(findings, ACTION_VERSION), null, 2), {
    mode: 0o644,
  });
  core.setOutput('sarif-file', file);
}

export function setOutputs(findings: readonly Finding[]): void {
  const counts = countBySeverity(findings);
  core.setOutput('findings-count', findings.length);
  core.setOutput('critical-count', counts.critical);
  core.setOutput('high-count', counts.high);
  core.setOutput('findings', JSON.stringify(findings));
}

/** Post or update the PR comment. Failure (e.g. a read-only fork token) is only a warning. */
async function comment(
  plan: ScanPlan,
  report: Omit<ReportInput, 'maxRows'>,
): Promise<void> {
  const { pr, client, config, repo } = plan;
  if (!pr || !client || !config.comment) return;
  if (report.findings.length === 0 && !config.commentWhenClean) return;
  try {
    const body = renderReport({ ...report, maxRows: MAX_COMMENT_ROWS });
    await upsertComment(client, repo, pr.number, COMMENT_MARKER, body);
  } catch (error) {
    core.warning(
      `Could not post a PR comment (${errorStatus(error) ?? errorMessage(error)}). PRs from forks get a read-only token; results are in the job summary.`,
    );
  }
}

export async function publish(
  plan: ScanPlan,
  findings: readonly Finding[],
  engines: readonly EngineStatus[],
): Promise<void> {
  const report = {
    findings,
    languages: plan.detected.languages,
    ecosystems: plan.detected.ecosystems,
    engines,
    scope: plan.scope,
  };
  annotate(findings);
  await core.summary
    .addRaw(renderReport({ ...report, maxRows: MAX_SUMMARY_ROWS }))
    .write();
  await writeSarif(plan.config.sarifFile, findings);
  setOutputs(findings);
  await comment(plan, report);
}
