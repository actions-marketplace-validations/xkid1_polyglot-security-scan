import * as core from '@actions/core';
import * as github from '@actions/github';

import {
  applyInlineIgnores,
  dedupe,
  detect,
  listPullRequestFiles,
  SKIP_DIRS,
  sortFindings,
} from '@libs';
import { listFiles, makeMatcher, meetsThreshold } from '@utils';

import { runCodeChecks, runWorkflowCheck, type ScanPlan } from './checks';
import { readConfig } from './config';
import { currentPullRequest, resolveScope } from './context';
import { publish } from './publish';
import { CheckRecorder } from './recorder';

import type { ActionConfig, Finding, RepoRef } from '@types';

/** Detect languages, resolve the PR and the in-scope file list. */
async function plan(config: ActionConfig): Promise<ScanPlan> {
  const repo: RepoRef = github.context.repo;
  const pr = currentPullRequest(repo);
  const scope = resolveScope(config.scope, pr);
  const isExcluded = makeMatcher(config.exclude);

  const allFiles = (await listFiles(config.root, { skipDirs: SKIP_DIRS })).filter(
    (f) => !isExcluded(f),
  );
  const needsFiles = [...config.checks].some((check) => check !== 'workflows');
  if (needsFiles && allFiles.length === 0) {
    throw new Error(
      `No files found in ${config.root}. Add "- uses: actions/checkout@v5" before this action.`,
    );
  }

  const detected = detect(allFiles);
  core.info(
    `Detected languages: ${detected.languages.map((l) => `${l.name} (${l.files})`).join(', ') || 'none'}`,
  );
  core.info(
    `Package ecosystems: ${detected.ecosystems.map((e) => e.name).join(', ') || 'none'}`,
  );
  core.setOutput('languages', JSON.stringify(detected.languages.map((l) => l.name)));

  const client = config.token ? github.getOctokit(config.token) : null;
  const prFiles = pr && client ? await listPullRequestFiles(client, repo, pr.number) : [];
  const changedFiles = new Set(
    prFiles.filter((f) => f.status !== 'removed').map((f) => f.filename),
  );
  const scanFiles =
    scope === 'all' ? allFiles : allFiles.filter((f) => changedFiles.has(f));
  core.info(`Scope: ${scope} (${scanFiles.length} file(s) to scan)`);

  return { config, scope, detected, scanFiles, changedFiles, repo, pr, prFiles, client };
}

/**
 * Keep in-scope, non-excluded, non-ignored findings, most severe first. Findings in
 * changed files are kept even under vendored directories: a secret added to `vendor/`
 * in a PR must still be reported.
 */
async function finalize(
  plan: ScanPlan,
  findings: readonly Finding[],
): Promise<Finding[]> {
  const isExcluded = makeMatcher(plan.config.exclude);
  const inScope = (file: string): boolean =>
    !isExcluded(file) && (plan.scope === 'all' || plan.changedFiles.has(file));
  const kept = dedupe(findings).filter((f) => f.check === 'workflows' || inScope(f.file));
  return sortFindings(await applyInlineIgnores(plan.config.root, kept));
}

/** The action's entry point: scan, report, and fail the job at the configured severity. */
export async function run(): Promise<void> {
  const config = readConfig();
  const scanPlan = await plan(config);

  const recorder = new CheckRecorder(config.checks);
  await runCodeChecks(scanPlan, recorder);
  await runWorkflowCheck(scanPlan, recorder);

  const findings = await finalize(scanPlan, recorder.findings);
  await publish(scanPlan, findings, recorder.engines);

  const blocking = findings.filter((f) => meetsThreshold(f.severity, config.failOn));
  if (blocking.length > 0) {
    core.setFailed(
      `${blocking.length} finding(s) at or above "${config.failOn}". See the job summary.`,
    );
  }
}
