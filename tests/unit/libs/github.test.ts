import { describe, expect, it, vi } from 'vitest';

import {
  getFileText,
  listPullRequestFiles,
  upsertComment,
  type GitHubClient,
} from '@libs';

const repo = { owner: 'o', repo: 'r' };

function fakeClient(
  overrides: {
    getContent?: () => Promise<unknown>;
    comments?: unknown[];
    files?: unknown[];
  } = {},
) {
  const createComment = vi.fn();
  const updateComment = vi.fn();
  const client = {
    rest: {
      repos: {
        getContent: vi.fn(overrides.getContent ?? (() => Promise.resolve({ data: '' }))),
      },
      issues: { listComments: vi.fn(), createComment, updateComment },
      pulls: { listFiles: vi.fn() },
    },
    paginate: vi.fn((fn: unknown) =>
      Promise.resolve(
        fn === client.rest.issues.listComments
          ? (overrides.comments ?? [])
          : (overrides.files ?? []),
      ),
    ),
  };
  return { client: client as unknown as GitHubClient, createComment, updateComment };
}

describe('getFileText', () => {
  it('decodes every response shape', async () => {
    const shapes: unknown[] = [
      'plain',
      new TextEncoder().encode('bytes').buffer,
      new TextEncoder().encode('view'),
      { content: Buffer.from('b64').toString('base64'), encoding: 'base64' },
      { content: 'utf', encoding: 'utf-8' },
    ];
    const results = [];
    for (const data of shapes) {
      const { client } = fakeClient({ getContent: () => Promise.resolve({ data }) });
      results.push(await getFileText(client, repo, 'a.yml', 'sha'));
    }
    expect(results).toEqual(['plain', 'bytes', 'view', 'b64', 'utf']);
  });

  it('returns null for missing, unknown or oversized content and rethrows other errors', async () => {
    const notFound = fakeClient({
      getContent: () => Promise.reject(Object.assign(new Error('x'), { status: 404 })),
    });
    expect(await getFileText(notFound.client, repo, 'a.yml', 'sha')).toBeNull();
    const unknown = fakeClient({
      getContent: () => Promise.resolve({ data: [{ type: 'dir' }] }),
    });
    expect(await getFileText(unknown.client, repo, 'a', 'sha')).toBeNull();
    const huge = fakeClient({
      getContent: () => Promise.resolve({ data: 'x'.repeat(1024 * 1024 + 1) }),
    });
    expect(await getFileText(huge.client, repo, 'a', 'sha')).toBeNull();
    const failing = fakeClient({
      getContent: () => Promise.reject(Object.assign(new Error('x'), { status: 500 })),
    });
    await expect(getFileText(failing.client, repo, 'a', 'sha')).rejects.toThrow('x');
  });
});

describe('upsertComment', () => {
  it('updates the bot comment with the marker', async () => {
    const { client, createComment, updateComment } = fakeClient({
      comments: [
        { id: 1, body: 'MARK by a human', user: { type: 'User' } },
        { id: 2, body: 'MARK', user: { type: 'Bot' } },
      ],
    });
    await upsertComment(client, repo, 5, 'MARK', 'new');
    expect(updateComment).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      comment_id: 2,
      body: 'new',
    });
    expect(createComment).not.toHaveBeenCalled();
  });

  it('never overwrites a human comment that contains the marker', async () => {
    const { client, createComment, updateComment } = fakeClient({
      comments: [{ id: 1, body: 'MARK', user: { type: 'User' } }],
    });
    await upsertComment(client, repo, 5, 'MARK', 'new');
    expect(updateComment).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      issue_number: 5,
      body: 'new',
    });
  });
});

describe('listPullRequestFiles', () => {
  it('maps API fields', async () => {
    const { client } = fakeClient({
      files: [{ filename: 'b', status: 'renamed', previous_filename: 'a', additions: 1 }],
    });
    expect(await listPullRequestFiles(client, repo, 1)).toEqual([
      { filename: 'b', status: 'renamed', previousFilename: 'a' },
    ]);
  });
});
