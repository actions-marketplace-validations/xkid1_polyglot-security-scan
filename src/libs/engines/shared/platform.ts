import os from 'node:os';

import type { Platform } from '@types';

/** The runner's OS/CPU in release-asset terms. Throws on unsupported runners. */
export function currentPlatform(): Platform {
  const platform = os.platform();
  const arch = os.arch();
  if (platform !== 'linux' && platform !== 'darwin' && platform !== 'win32') {
    throw new Error(`Unsupported OS: ${platform}`);
  }
  if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Unsupported CPU: ${arch}`);
  const windows = platform === 'win32';
  return { os: windows ? 'windows' : platform, arch, windows };
}
