import type { GitHubClient } from './client';
import type { RepoRef } from '@types';

/**
 * Create the action's PR comment, or update it if one carrying `marker` already exists,
 * so re-runs do not pile up comments. Only comments written by a bot are updated, so a
 * human who pastes the marker cannot have their comment overwritten.
 */
export async function upsertComment(
  client: GitHubClient,
  { owner, repo }: RepoRef,
  issueNumber: number,
  marker: string,
  body: string,
): Promise<void> {
  const comments = await client.paginate(client.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find(
    (c) => c.user?.type === 'Bot' && c.body?.includes(marker),
  );
  if (existing) {
    await client.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await client.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}
