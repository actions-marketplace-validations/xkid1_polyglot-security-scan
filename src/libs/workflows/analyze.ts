// Pure analysis: compares the old and new text of one workflow / action file and
// returns security-relevant findings. No GitHub API calls, so it is easy to test.
import { DEFAULT_TRUSTED_OWNERS } from './constants';
import { parseWorkflow } from './document';
import { WORKFLOW_RULES, type RuleContext } from './rules';

import type { AnalyzeOptions, Finding, WorkflowDocument } from '@types';

/**
 * Compare two versions of a workflow/action file.
 * @param oldText previous contents, or `null` for a new file
 * @param newText new contents, or `null` for a deleted file
 * @param file repository-relative path, used in findings
 */
export function analyzeWorkflow(
  oldText: string | null,
  newText: string | null,
  file: string,
  { trustedOwners = DEFAULT_TRUSTED_OWNERS }: AnalyzeOptions = {},
): Finding[] {
  const findings: Finding[] = [];
  const report: RuleContext['report'] = (severity, rule, message) => {
    findings.push({
      check: 'workflows',
      tool: 'built-in',
      severity,
      rule,
      file,
      message,
    });
  };

  if (newText === null) return findings; // deleting a workflow only reduces risk

  const parsedNew = parseWorkflow(newText);
  if (!parsedNew.ok) {
    report('low', 'parse-error', `Could not parse YAML: ${parsedNew.error}`);
    return findings;
  }
  const parsedOld = oldText === null ? null : parseWorkflow(oldText);
  // An unparsable old version is compared as empty, so everything in the new one counts.
  const oldDoc: WorkflowDocument = parsedOld?.ok ? parsedOld.doc : {};

  const ctx: RuleContext = {
    oldDoc,
    newDoc: parsedNew.doc,
    oldText,
    newText,
    isNew: oldText === null,
    trustedOwners: trustedOwners.map((owner) => owner.toLowerCase()),
    report,
  };
  for (const rule of WORKFLOW_RULES) rule(ctx);
  return findings;
}
