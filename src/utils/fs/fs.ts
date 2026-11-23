import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Whether something exists at an absolute path. */
export async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export interface ListFilesOptions {
  /** Directory names to skip anywhere in the tree (e.g. `node_modules`). */
  readonly skipDirs?: ReadonlySet<string>;
  /** Stop after this many files. Protects against huge or hostile repositories. */
  readonly maxFiles?: number;
}

/** Convert a path to `/` separators, as used in findings and globs. */
export const toPosix = (p: string): string => p.split(path.sep).join('/');

/** Whether a `path.relative()` result climbs out of its base directory. */
const escapesBase = (rel: string): boolean =>
  rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);

/**
 * Resolve a repository-relative path and make sure it stays inside `root`.
 * Returns `null` for absolute paths or anything that escapes via `..`.
 */
export function resolveInside(root: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    return null;
  }
  const base = path.resolve(root);
  const full = path.resolve(base, relativePath);
  const rel = path.relative(base, full);
  return rel === '' || escapesBase(rel) ? null : full;
}

/** Whether `child` is `parent` itself or somewhere below it. */
export function isInsideOrEqual(parent: string, child: string): boolean {
  return !escapesBase(path.relative(path.resolve(parent), path.resolve(child)));
}

/**
 * Recursively list regular files as repository-relative `/` paths. Symbolic links are
 * never followed (neither files nor directories), so the walk cannot leave `root`.
 */
export async function listFiles(
  root: string,
  { skipDirs = new Set(), maxFiles = 50_000 }: ListFilesOptions = {},
): Promise<string[]> {
  const out: string[] = [];
  const stack = [''];
  while (stack.length > 0 && out.length < maxFiles) {
    const rel = stack.pop() ?? '';
    let entries;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- walk stays under root: names come from readdir and symlinks are never followed
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue; // unreadable directory: skip it
    }
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) stack.push(child);
      } else if (entry.isFile() && out.length < maxFiles) {
        out.push(child);
      }
    }
  }
  return out;
}

/** Heuristic used by git and most scanners: a NUL byte in the first 8 KB means binary. */
export function isBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export interface ReadTextOptions {
  /** Files larger than this are skipped (returns `null`). */
  readonly maxBytes?: number;
}

/**
 * Read a repository-relative text file. Returns `null` when the path escapes `root`, the
 * file is missing, not a regular file, too large, or binary.
 */
export async function readTextFile(
  root: string,
  relativePath: string,
  { maxBytes = 2 * 1024 * 1024 }: ReadTextOptions = {},
): Promise<string | null> {
  const full = resolveInside(root, relativePath);
  if (!full) return null;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- full was checked by resolveInside() above
    const info = await stat(full);
    if (!info.isFile() || info.size > maxBytes) return null;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- full was checked by resolveInside() above
    const buf = await readFile(full);
    return isBinary(buf) ? null : buf.toString('utf8');
  } catch {
    return null;
  }
}
