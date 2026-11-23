import { chmod } from 'node:fs/promises';
import path from 'node:path';

import * as tc from '@actions/tool-cache';

import { assertStrictVersion, currentPlatform, verifyChecksum } from '../shared';

const TOOL = 'osv-scanner';

/** Download (or reuse from the tool cache) a checksum-verified OSV-Scanner binary. */
export async function installOsvScanner(version: string): Promise<string> {
  assertStrictVersion(TOOL, version);
  const { os, arch, windows } = currentPlatform();
  const bin = windows ? `${TOOL}.exe` : TOOL;

  const cached = tc.find(TOOL, version);
  if (cached) return path.join(cached, bin);

  const asset = `${TOOL}_${os}_${arch === 'x64' ? 'amd64' : 'arm64'}${windows ? '.exe' : ''}`;
  const base = `https://github.com/google/osv-scanner/releases/download/v${version}`;
  const file = await tc.downloadTool(`${base}/${asset}`);
  await verifyChecksum(file, asset, base, [
    `${TOOL}_SHA256SUMS`,
    `${TOOL}_${version}_checksums.txt`,
    'checksums.txt',
  ]);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- file is the tool-cache download path
  await chmod(file, 0o755);
  const dir = await tc.cacheFile(file, bin, TOOL, version);
  return path.join(dir, bin);
}
