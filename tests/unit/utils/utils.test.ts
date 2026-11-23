import { symlinkSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRepo } from '@tests';
import {
  clip,
  errorMessage,
  errorStatus,
  escapeCodeSpan,
  escapeTableCell,
  isInsideOrEqual,
  lineAt,
  listFiles,
  makeMatcher,
  meetsThreshold,
  ownValue,
  parseJson,
  parseList,
  readTextFile,
  resolveInside,
  singleLineError,
} from '@utils';

describe('glob matcher', () => {
  it('supports **, * and trailing /', () => {
    const match = makeMatcher(['test/**', 'docs/', '*.min.js', ' ', './build/out.js']);
    expect(match('test/a/b.js')).toBe(true);
    expect(match('docs/x.md')).toBe(true);
    expect(match('app.min.js')).toBe(true);
    expect(match('build/out.js')).toBe(true);
    expect(match('src/test.js')).toBe(false);
    expect(match('lib/app.min.js')).toBe(false);
  });

  it('treats regex characters literally', () => {
    const match = makeMatcher(['a+b(c).js']);
    expect(match('a+b(c).js')).toBe(true);
    expect(match('aab(c)xjs')).toBe(false);
  });
});

describe('severity', () => {
  it('compares against fail-on', () => {
    expect(meetsThreshold('high', 'medium')).toBe(true);
    expect(meetsThreshold('low', 'medium')).toBe(false);
    expect(meetsThreshold('critical', 'none')).toBe(false);
  });
});

describe('text helpers', () => {
  it('clips and collapses whitespace', () => {
    expect(clip('  a\n\n b  ')).toBe('a b');
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip(undefined)).toBe('');
  });

  it('escapes table cells so untrusted text cannot break the table or inject HTML', () => {
    expect(escapeTableCell('a | b\nc')).toBe('a \\| b c');
    expect(escapeTableCell('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    // A pre-escaped pipe must not turn back into a column separator.
    expect(escapeTableCell('a\\|b')).toBe('a\\\\\\|b');
  });

  it('keeps code spans closed', () => {
    expect(escapeCodeSpan('x`y\nz')).toBe("x'y z");
  });

  it('computes 1-based line numbers', () => {
    expect(lineAt('a\nb\nc', 0)).toBe(1);
    expect(lineAt('a\nb\nc', 4)).toBe(3);
    expect(lineAt('a', 99)).toBe(1);
  });
});

describe('helpers', () => {
  it('parses list inputs', () => {
    expect(parseList(' a, b\n\nc ,')).toEqual(['a', 'b', 'c']);
    expect(parseList(undefined)).toEqual([]);
  });

  it('never reads inherited properties', () => {
    const table: Record<string, number> = { a: 1 };
    expect(ownValue(table, 'a')).toBe(1);
    expect(ownValue(table, 'constructor')).toBeUndefined();
    expect(ownValue(table, '__proto__')).toBeUndefined();
  });

  it('describes errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorStatus({ status: 404 })).toBe(404);
    expect(errorStatus({ status: '404' })).toBeUndefined();
    expect(errorStatus(null)).toBeUndefined();
    expect(singleLineError(new Error('a\\nb\nc   d'))).toBe('a b c d');
  });

  it('names the source of invalid JSON', () => {
    expect(parseJson('{"a":1}', 'tool')).toEqual({ a: 1 });
    expect(() => parseJson('{', 'osv-scanner')).toThrow(
      /osv-scanner produced invalid JSON/,
    );
  });
});

describe('file system', () => {
  it('rejects paths that escape the root', () => {
    const root = '/repo';
    expect(resolveInside(root, 'a/b.txt')).toBe(path.resolve('/repo/a/b.txt'));
    expect(resolveInside(root, '..foo')).toBe(path.resolve('/repo/..foo'));
    const bad = ['../etc/passwd', 'a/../../x', '/etc/passwd', '', '.', 'a\0b'];
    expect(bad.map((p) => resolveInside(root, p))).toEqual(bad.map(() => null));
    expect(isInsideOrEqual('/repo', '/repo')).toBe(true);
    expect(isInsideOrEqual('/repo', '/repo/sub')).toBe(true);
    expect(isInsideOrEqual('/repo', '/repository')).toBe(false);
    expect(isInsideOrEqual('/repo', '/')).toBe(false);
  });

  it('lists files, skips configured dirs and never follows symlinks', async () => {
    const outside = createRepo({ 'secret.txt': 'outside' });
    const root = createRepo({ 'a.js': '', 'sub/b.py': '', 'node_modules/x.js': '' });
    symlinkSync(outside, path.join(root, 'linked-dir'));
    symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'linked-file.txt'));

    const files = await listFiles(root, { skipDirs: new Set(['node_modules']) });
    expect(files.sort()).toEqual(['a.js', 'sub/b.py']);
    expect(await listFiles(root, { maxFiles: 1 })).toHaveLength(1);
    expect(await listFiles(path.join(root, 'missing'))).toEqual([]);
  });

  it('reads text files safely', async () => {
    const root = createRepo({
      'ok.txt': 'hello',
      'bin.dat': new Uint8Array([1, 0, 2]),
      'big.txt': 'x'.repeat(20),
    });
    expect(await readTextFile(root, 'ok.txt')).toBe('hello');
    expect(await readTextFile(root, 'bin.dat')).toBeNull();
    expect(await readTextFile(root, 'big.txt', { maxBytes: 10 })).toBeNull();
    expect(await readTextFile(root, 'missing.txt')).toBeNull();
    expect(await readTextFile(root, '../ok.txt')).toBeNull();
  });
});
