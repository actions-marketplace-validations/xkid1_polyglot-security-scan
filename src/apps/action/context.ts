import * as github from '@actions/github';

import { isRecord } from '@utils';

import type { PullRequestRef, RepoRef, Scope, ScopeInput } from '@types';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** The current pull request, or `null` when the event is not a pull request. */
export function currentPullRequest(base: RepoRef): PullRequestRef | null {
  const pr: unknown = github.context.payload.pull_request;
  if (!isRecord(pr) || typeof pr.number !== 'number') return null;
  const baseRef = isRecord(pr.base) ? pr.base : {};
  const head = isRecord(pr.head) ? pr.head : {};
  const headRepo = isRecord(head.repo) ? head.repo : {};
  const headOwner = isRecord(headRepo.owner) ? headRepo.owner : {};
  return {
    number: pr.number,
    baseSha: str(baseRef.sha) ?? '',
    headSha: str(head.sha) ?? '',
    headOwner: str(headOwner.login) ?? base.owner,
    headRepo: str(headRepo.name) ?? base.repo,
  };
}

/** `auto` means "changed files" on pull requests and "everything" otherwise. */
export function resolveScope(input: ScopeInput, pr: PullRequestRef | null): Scope {
  if (input === 'auto') return pr ? 'changed' : 'all';
  if (input === 'changed' && !pr) {
    throw new Error('scope: changed only works on pull_request events.');
  }
  return input;
}
