import type { GitHubClient } from './client';
import type { PullRequestFile, RepoRef } from '@types';

/** Every file in a pull request (the API pages through up to 3000 files). */
export async function listPullRequestFiles(
  client: GitHubClient,
  { owner, repo }: RepoRef,
  pullNumber: number,
): Promise<PullRequestFile[]> {
  const files = await client.paginate(client.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    previousFilename: f.previous_filename,
  }));
}
