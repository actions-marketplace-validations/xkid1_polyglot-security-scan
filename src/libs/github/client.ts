import type * as github from '@actions/github';

/** Authenticated Octokit instance as returned by `@actions/github`. */
export type GitHubClient = ReturnType<typeof github.getOctokit>;
