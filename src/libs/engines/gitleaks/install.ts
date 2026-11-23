import path from 'node:path';

import * as tc from '@actions/tool-cache';

import { assertStrictVersion, currentPlatform, verifyChecksum } from '../shared';

const TOOL = 'gitleaks';

/** Download (or reuse from the tool cache) a checksum-verified Gitleaks binary. */
export async function installGitleaks(version: string): Promise<string> {
  assertStrictVersion(TOOL, version);
  const { os, arch, windows } = currentPlatform();
  const bin = windows ? `${TOOL}.exe` : TOOL;

  const cached = tc.find(TOOL, version);
  if (cached) return path.join(cached, bin);

  const asset = `${TOOL}_${version}_${os}_${arch}.${windows ? 'zip' : 'tar.gz'}`;
  const base = `https://github.com/gitleaks/gitleaks/releases/download/v${version}`;
  const file = await tc.downloadTool(`${base}/${asset}`);
  await verifyChecksum(file, asset, base, [
    `${TOOL}_${version}_checksums.txt`,
    'checksums.txt',
  ]);
  const extracted = windows ? await tc.extractZip(file) : await tc.extractTar(file);
  const dir = await tc.cacheDir(extracted, TOOL, version);
  return path.join(dir, bin);
}
