// One function per concern. Each compares the old and new document and reports only
// what the change ADDS, so existing (already reviewed) risk is not reported again.
import { classifyUses } from './classify-uses';
import { DANGEROUS_TRIGGERS, UNKNOWN_WRITE_SCOPE, WRITE_SCOPE_RISK } from './constants';
import {
  checksOutPrHead,
  jobs,
  secretNames,
  triggers,
  untrustedExpressions,
  usesRefs,
  usesSecretsInherit,
  usesSelfHosted,
  writeScopes,
} from './document';

import type { Severity, WorkflowDocument } from '@types';

/** Everything a rule needs about one changed file. */
export interface RuleContext {
  readonly oldDoc: WorkflowDocument;
  readonly newDoc: WorkflowDocument;
  readonly oldText: string | null;
  readonly newText: string;
  /** True when the file did not exist before this change. */
  readonly isNew: boolean;
  /** Lower-case owners whose actions are trusted. */
  readonly trustedOwners: readonly string[];
  readonly report: (severity: Severity, rule: string, message: string) => void;
}

export function checkTriggers({ oldDoc, newDoc, report }: RuleContext): void {
  const before = triggers(oldDoc);
  const after = triggers(newDoc);
  for (const trigger of after) {
    const danger = DANGEROUS_TRIGGERS.get(trigger);
    if (danger && !before.has(trigger)) {
      report(
        danger.severity,
        'dangerous-trigger',
        `Adds the \`${trigger}\` trigger. ${danger.why}`,
      );
    }
  }
  const pwn = (doc: WorkflowDocument, on: Set<string>): boolean =>
    on.has('pull_request_target') && checksOutPrHead(doc);
  if (pwn(newDoc, after) && !pwn(oldDoc, before)) {
    report(
      'high',
      'pwn-request',
      '`pull_request_target` together with checking out the PR head lets a fork PR run its own code with your secrets and write token.',
    );
  }
}

function comparePermissions(
  ctx: RuleContext,
  oldPermissions: unknown,
  newPermissions: unknown,
  where: string,
  existedBefore: boolean,
): void {
  const before = writeScopes(oldPermissions);
  const after = writeScopes(newPermissions);
  if (after.writes.has('*') && !before.writes.has('*')) {
    ctx.report(
      'high',
      'write-all',
      `${where}: sets \`permissions: write-all\` (write access to everything).`,
    );
    return;
  }
  for (const scope of after.writes) {
    if (before.writes.has(scope) || before.writes.has('*')) continue;
    const { severity, why } = WRITE_SCOPE_RISK.get(scope) ?? UNKNOWN_WRITE_SCOPE;
    ctx.report(
      severity,
      'permission-added',
      `${where}: adds \`${scope}: write\` — ${why}.`,
    );
  }
  if (existedBefore && before.set && !after.set) {
    ctx.report(
      'medium',
      'permissions-removed',
      `${where}: removes the \`permissions:\` block, so it falls back to the repository's default token permissions.`,
    );
  }
}

export function checkPermissions(ctx: RuleContext): void {
  const { oldDoc, newDoc, isNew } = ctx;
  comparePermissions(ctx, oldDoc.permissions, newDoc.permissions, 'Workflow', !isNew);

  const oldJobs = jobs(oldDoc);
  const newJobs = jobs(newDoc);
  for (const [id, job] of newJobs) {
    comparePermissions(
      ctx,
      oldJobs.get(id)?.permissions,
      job.permissions,
      `Job \`${id}\``,
      oldJobs.has(id),
    );
  }

  const hasJobs = newDoc.jobs !== undefined;
  const anyJobUnscoped = [...newJobs.values()].some(
    (job) => job.permissions === undefined,
  );
  if (isNew && hasJobs && newDoc.permissions === undefined && anyJobUnscoped) {
    ctx.report(
      'medium',
      'no-permissions',
      'New workflow has no `permissions:` block. Add one (e.g. `permissions: { contents: read }`) so the token only gets what it needs.',
    );
  }
}

export function checkActionRefs({
  oldDoc,
  newDoc,
  trustedOwners,
  report,
}: RuleContext): void {
  const before = usesRefs(oldDoc);
  for (const ref of usesRefs(newDoc)) {
    if (before.has(ref)) continue;
    const risk = classifyUses(ref, trustedOwners);
    if (risk) report(risk.severity, risk.rule, risk.message);
  }
}

export function checkScriptInjection({ oldDoc, newDoc, report }: RuleContext): void {
  const before = untrustedExpressions(oldDoc);
  for (const expr of untrustedExpressions(newDoc)) {
    if (!before.has(expr)) {
      report(
        'high',
        'script-injection',
        `Uses attacker-controlled \`${expr}\` directly in a script. Pass it through an \`env:\` variable instead.`,
      );
    }
  }
}

export function checkSecrets({
  oldDoc,
  newDoc,
  oldText,
  newText,
  report,
}: RuleContext): void {
  const before = secretNames(oldText);
  for (const name of secretNames(newText)) {
    if (!before.has(name))
      report('low', 'new-secret', `Starts using secret \`${name}\`.`);
  }
  if (usesSecretsInherit(newDoc) && !usesSecretsInherit(oldDoc)) {
    report(
      'medium',
      'secrets-inherit',
      'Passes **all** secrets to a reusable workflow with `secrets: inherit`.',
    );
  }
}

export function checkRunners({ oldDoc, newDoc, report }: RuleContext): void {
  if (!usesSelfHosted(newDoc) || usesSelfHosted(oldDoc)) return;
  const on = triggers(newDoc);
  const prTrigger = on.has('pull_request') || on.has('pull_request_target');
  report(
    prTrigger ? 'high' : 'medium',
    'self-hosted',
    `Starts using a self-hosted runner${prTrigger ? ' on a PR trigger — PR code could persist on your machine' : ''}.`,
  );
}

/** All rules, in the order their findings are reported. */
export const WORKFLOW_RULES: readonly ((ctx: RuleContext) => void)[] = [
  checkTriggers,
  checkPermissions,
  checkActionRefs,
  checkScriptInjection,
  checkSecrets,
  checkRunners,
];
