import {
  analyzeWorkflow,
  getFileText,
  isWorkflowPath,
  runGitleaks,
  runOsv,
  runSemgrep,
  scanMalware,
  semgrepRulesets,
  type GitHubClient,
} from '@libs';

import type { CheckRecorder } from './recorder';
import type {
  ActionConfig,
  DetectResult,
  Finding,
  PullRequestFile,
  PullRequestRef,
  RepoRef,
  Scope,
} from '@types';

/** Everything the checks need, computed once by `run`. */
export interface ScanPlan {
  readonly config: ActionConfig;
  readonly scope: Scope;
  readonly detected: DetectResult;
  /** In-scope repository-relative files. */
  readonly scanFiles: readonly string[];
  /** Files added or modified by the pull request (empty outside PRs). */
  readonly changedFiles: ReadonlySet<string>;
  readonly repo: RepoRef;
  readonly pr: PullRequestRef | null;
  readonly prFiles: readonly PullRequestFile[];
  readonly client: GitHubClient | null;
}

const CODE_CHECKS = [
  ['dependencies', 'osv-scanner'],
  ['code', 'semgrep'],
  ['secrets', 'gitleaks'],
  ['malware', 'built-in'],
] as const;

/** Dependencies, code, secrets and malware: the checks that look at repository files. */
export async function runCodeChecks(
  plan: ScanPlan,
  recorder: CheckRecorder,
): Promise<void> {
  const { config, scope, detected, scanFiles } = plan;
  const { root, versions } = config;

  if (scope === 'changed' && scanFiles.length === 0) {
    for (const [check, tool] of CODE_CHECKS)
      recorder.skip(check, tool, 'no in-scope files changed');
    return;
  }

  if (detected.ecosystems.length > 0) {
    await recorder.run('dependencies', 'osv-scanner', () => runOsv(root, versions.osv));
  } else {
    recorder.skip('dependencies', 'osv-scanner', 'no dependency files found');
  }

  if (process.platform === 'win32') {
    // Semgrep publishes no Windows build: report it as skipped, not as a failure.
    recorder.skip('code', 'semgrep', 'Semgrep does not support Windows runners');
  } else {
    const rulesets = config.semgrepRules.length
      ? config.semgrepRules
      : semgrepRulesets(detected.languages);
    await recorder.run('code', 'semgrep', () =>
      runSemgrep(
        root,
        versions.semgrep,
        rulesets,
        scope === 'changed' ? scanFiles : null,
      ),
    );
  }
  await recorder.run('secrets', 'gitleaks', () => runGitleaks(root, versions.gitleaks));
  await recorder.run('malware', 'built-in', async () => ({
    findings: await scanMalware(root, scanFiles),
  }));
}

/** Compare each changed workflow file between the PR base and head. */
async function analyzeChangedWorkflows(
  client: GitHubClient,
  plan: ScanPlan & { readonly pr: PullRequestRef },
): Promise<Finding[]> {
  const { pr, repo, prFiles, config } = plan;
  const head: RepoRef = { owner: pr.headOwner, repo: pr.headRepo };
  const findings: Finding[] = [];
  for (const file of prFiles) {
    if (file.status === 'removed' || !isWorkflowPath(file.filename)) continue;
    const oldText =
      file.status === 'added'
        ? null
        : await getFileText(
            client,
            repo,
            file.previousFilename ?? file.filename,
            pr.baseSha,
          );
    const newText = await getFileText(client, head, file.filename, pr.headSha);
    findings.push(
      ...analyzeWorkflow(oldText, newText, file.filename, {
        trustedOwners: config.trustedOwners,
      }),
    );
  }
  return findings;
}

export async function runWorkflowCheck(
  plan: ScanPlan,
  recorder: CheckRecorder,
): Promise<void> {
  if (!recorder.isEnabled('workflows')) return;
  const { pr, client } = plan;
  if (!pr || !client) {
    recorder.skip('workflows', 'built-in', 'only runs on pull requests');
    return;
  }
  await recorder.run('workflows', 'built-in', async () => ({
    findings: await analyzeChangedWorkflows(client, { ...plan, pr }),
  }));
}
