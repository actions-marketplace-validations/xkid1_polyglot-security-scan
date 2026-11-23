import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** SHA-256 of a file as lower-case hex. */
export async function sha256File(file: string): Promise<string> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- callers pass tool-cache download paths
  const content = await readFile(file);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Find the expected digest for `assetName` in a checksums file. Accepts the common
 * `<hex>  <name>` and `<hex> *<name>` (binary mode) formats. Returns `null` when the
 * asset is not listed or the digest is malformed.
 */
export function findChecksum(sums: string, assetName: string): string | null {
  for (const line of sums.split('\n')) {
    const [digest, name] = line.trim().split(/\s+/);
    if (!digest || name?.replace(/^\*/, '') !== assetName) continue;
    const hex = digest.toLowerCase();
    return SHA256_HEX.test(hex) ? hex : null;
  }
  return null;
}

/** Constant-time comparison of two hex digests of equal length. */
export function digestsMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

/**
 * Download the publisher's checksums file (trying several known names) and verify
 * `file` against it. Throws when no checksum is published or the digest differs, so an
 * unverified binary is never run.
 */
export async function verifyChecksum(
  file: string,
  assetName: string,
  baseUrl: string,
  candidates: readonly string[],
): Promise<void> {
  for (const name of candidates) {
    let sumsPath: string;
    try {
      sumsPath = await tc.downloadTool(`${baseUrl}/${name}`);
    } catch {
      continue; // this release does not publish a file with that name
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- sumsPath is a tool-cache download path
    const expected = findChecksum(await readFile(sumsPath, 'utf8'), assetName);
    if (!expected) continue;
    const actual = await sha256File(file);
    if (!digestsMatch(expected, actual)) {
      throw new Error(
        `Checksum mismatch for ${assetName}: expected ${expected}, got ${actual}. Refusing to run it.`,
      );
    }
    core.info(`Verified SHA-256 of ${assetName}`);
    return;
  }
  throw new Error(
    `Could not find a published checksum for ${assetName}; refusing to run an unverified binary.`,
  );
}
