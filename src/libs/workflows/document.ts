// Parsing and read-only accessors for workflow / action.yml documents. All values come
// from untrusted YAML, so every accessor narrows types itself and never throws.
import YAML from 'yaml';

import { isRecord } from '@utils';

import { UNTRUSTED_EXPRESSION, YAML_LIMITS } from './constants';

import type {
  ParsedWorkflow,
  WorkflowDocument,
  WorkflowJob,
  WorkflowStep,
  WriteScopes,
} from '@types';

const EMPTY: WorkflowDocument = {};

export function parseWorkflow(text: string): ParsedWorkflow {
  try {
    const doc: unknown = YAML.parse(text, YAML_LIMITS);
    return { ok: true, doc: isRecord(doc) ? doc : EMPTY };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Event names from `on:` (string, list or mapping form). */
export function triggers(doc: WorkflowDocument): Set<string> {
  const { on } = doc;
  if (typeof on === 'string') return new Set([on]);
  if (Array.isArray(on)) return new Set(on.map(String));
  if (isRecord(on)) return new Set(Object.keys(on));
  return new Set();
}

/** Jobs by id. Non-object jobs are dropped. */
export function jobs(doc: WorkflowDocument): Map<string, WorkflowJob> {
  const out = new Map<string, WorkflowJob>();
  if (!isRecord(doc.jobs)) return out;
  for (const [id, job] of Object.entries(doc.jobs)) {
    if (isRecord(job)) out.set(id, job);
  }
  return out;
}

/** Steps of every job plus composite-action steps (`runs.steps`). */
export function steps(doc: WorkflowDocument): WorkflowStep[] {
  const raw: unknown[] = [];
  for (const job of jobs(doc).values()) {
    if (Array.isArray(job.steps)) raw.push(...(job.steps as unknown[]));
  }
  if (isRecord(doc.runs) && Array.isArray(doc.runs.steps))
    raw.push(...(doc.runs.steps as unknown[]));
  return raw.filter(isRecord);
}

/** A step's `with:` value by key, when it is a string. */
export function stepInput(step: WorkflowStep, key: string): string | undefined {
  if (!isRecord(step.with) || !Object.hasOwn(step.with, key)) return undefined;
  const value = step.with[key];
  return typeof value === 'string' ? value : undefined;
}

/** Every `uses:` reference: reusable workflows (job level) and actions (step level). */
export function usesRefs(doc: WorkflowDocument): Set<string> {
  const refs = new Set<string>();
  for (const job of jobs(doc).values()) {
    if (typeof job.uses === 'string') refs.add(job.uses.trim());
  }
  for (const step of steps(doc)) {
    if (typeof step.uses === 'string') refs.add(step.uses.trim());
  }
  return refs;
}

const normalizeExpression = (expr: string): string => expr.replace(/\s+/g, ' ');

/** Attacker-controlled expressions used directly in `run:` or github-script `script:`. */
export function untrustedExpressions(doc: WorkflowDocument): Set<string> {
  const found = new Set<string>();
  for (const step of steps(doc)) {
    const scripts: string[] = [];
    if (typeof step.run === 'string') scripts.push(step.run);
    const script = stepInput(step, 'script');
    if (
      typeof step.uses === 'string' &&
      step.uses.includes('github-script') &&
      script !== undefined
    ) {
      scripts.push(script);
    }
    for (const body of scripts) {
      for (const match of body.matchAll(UNTRUSTED_EXPRESSION))
        found.add(normalizeExpression(match[0]));
    }
  }
  return found;
}

/** Names of `secrets.X` referenced anywhere in the raw text. */
export function secretNames(text: string | null): Set<string> {
  const names = new Set<string>();
  for (const match of (text ?? '').matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

export const usesSecretsInherit = (doc: WorkflowDocument): boolean =>
  [...jobs(doc).values()].some((job) => job.secrets === 'inherit');

/** Whether any job's `runs-on` mentions `self-hosted` (string, list or group form). */
export const usesSelfHosted = (doc: WorkflowDocument): boolean =>
  [...jobs(doc).values()].some((job) =>
    JSON.stringify(job['runs-on'] ?? '').includes('self-hosted'),
  );

const PR_HEAD_REF = /pull_request\.head|github\.head_ref|refs\/pull\//;

/** `actions/checkout` of the PR head: together with `pull_request_target` a "pwn request". */
export const checksOutPrHead = (doc: WorkflowDocument): boolean =>
  steps(doc).some(
    (step) =>
      typeof step.uses === 'string' &&
      step.uses.startsWith('actions/checkout') &&
      PR_HEAD_REF.test(stepInput(step, 'ref') ?? ''),
  );

/** Write scopes granted by a `permissions:` value. */
export function writeScopes(permissions: unknown): WriteScopes {
  if (permissions === undefined || permissions === null)
    return { set: false, writes: new Set() };
  if (permissions === 'write-all') return { set: true, writes: new Set(['*']) };
  if (!isRecord(permissions)) return { set: true, writes: new Set() }; // read-all, {} …
  const writes = new Set<string>();
  for (const [scope, level] of Object.entries(permissions)) {
    if (level === 'write') writes.add(scope);
  }
  return { set: true, writes };
}

/** Whether a path is a workflow file or an action metadata file. */
export const isWorkflowPath = (p: string): boolean =>
  /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p) || /(^|\/)action\.ya?ml$/.test(p);
