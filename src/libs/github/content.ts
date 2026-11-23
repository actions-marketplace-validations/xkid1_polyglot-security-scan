import { errorStatus, isRecord } from '@utils';

import type { GitHubClient } from './client';
import type { RepoRef } from '@types';

/** Workflow files are small; anything bigger is not worth parsing. */
const MAX_CONTENT_BYTES = 1024 * 1024;

function decode(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  if (isRecord(data) && typeof data.content === 'string') {
    const encoding =
      data.encoding === 'utf-8' || data.encoding === 'utf8' ? 'utf8' : 'base64';
    return Buffer.from(data.content, encoding).toString('utf8');
  }
  return null;
}

/**
 * Text of a file at a given commit, read through the API (no checkout needed).
 * Returns `null` when the file does not exist at that commit or is too large.
 */
export async function getFileText(
  client: GitHubClient,
  { owner, repo }: RepoRef,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const res = await client.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
      mediaType: { format: 'raw' },
    });
    const text = decode(res.data);
    return text !== null && Buffer.byteLength(text) <= MAX_CONTENT_BYTES ? text : null;
  } catch (error) {
    if (errorStatus(error) === 404) return null;
    throw error;
  }
}
