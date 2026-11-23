// @tests: shared test helpers.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach } from 'vitest';

import type { Finding } from '@types';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Create a temporary repository with the given files. Removed after each test. */
export function createRepo(files: Readonly<Record<string, string | Uint8Array>>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'psg-'));
  created.push(root);
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** A finding with sensible defaults, for report/filter tests. */
export const makeFinding = (overrides: Partial<Finding> = {}): Finding => ({
  check: 'code',
  tool: 'semgrep',
  severity: 'medium',
  rule: 'r1',
  file: 'a.py',
  line: 2,
  message: 'message',
  ...overrides,
});

/** Set `INPUT_*` environment variables the way the Actions runner does. */
export function stubInputs(
  stub: (name: string, value: string) => void,
  inputs: Readonly<Record<string, string>>,
): void {
  for (const [name, value] of Object.entries(inputs)) {
    stub(`INPUT_${name.replace(/ /g, '_').toUpperCase()}`, value);
  }
}

/** Sorted `severity:rule` labels, for compact assertions. */
export const ruleLabels = (findings: readonly Finding[]): string[] =>
  findings.map((f) => `${f.severity}:${f.rule}`).sort();
