import { BRANCH_LIKE_REFS, COMMIT_SHA } from './constants';

import type { Severity } from '@types';

export interface UsesRisk {
  readonly severity: Severity;
  readonly rule: string;
  readonly message: string;
}

/**
 * Risk of a newly added `uses:` reference, or `null` if it is fine.
 * @param trustedOwners lower-case owner names
 */
export function classifyUses(
  ref: string,
  trustedOwners: readonly string[],
): UsesRisk | null {
  if (ref.startsWith('./')) return null; // local action, reviewed in this PR

  if (ref.startsWith('docker://')) {
    return ref.includes('@sha256:')
      ? null
      : {
          severity: 'medium',
          rule: 'unpinned-docker',
          message: `Docker image \`${ref}\` is not pinned to a digest (@sha256:...).`,
        };
  }

  const at = ref.lastIndexOf('@');
  if (at === -1)
    return {
      severity: 'medium',
      rule: 'unpinned-action',
      message: `\`${ref}\` has no version.`,
    };

  const name = ref.slice(0, at);
  const version = ref.slice(at + 1);
  const owner = (name.split('/')[0] ?? '').toLowerCase();
  const trusted = trustedOwners.includes(owner);

  if (COMMIT_SHA.test(version)) {
    return trusted
      ? null
      : {
          severity: 'low',
          rule: 'new-third-party-action',
          message: `New third-party action \`${name}\` (pinned to a SHA — good).`,
        };
  }
  if (BRANCH_LIKE_REFS.has(version.toLowerCase())) {
    return {
      severity: 'high',
      rule: 'branch-ref',
      message: `\`${ref}\` points at a branch. Whoever controls \`${name}\` can change the code that runs here at any time.`,
    };
  }
  if (trusted) {
    return {
      severity: 'low',
      rule: 'unpinned-action',
      message: `\`${ref}\` uses a tag instead of a commit SHA.`,
    };
  }
  return {
    severity: 'medium',
    rule: 'unpinned-action',
    message: `New third-party action \`${ref}\` is not pinned to a commit SHA. Tags can be moved to malicious code.`,
  };
}
