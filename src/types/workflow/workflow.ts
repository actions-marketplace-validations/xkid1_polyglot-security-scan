// Loose shapes of a parsed GitHub Actions workflow or action.yml. Every field is
// `unknown`: the YAML comes from a pull request and is untrusted, so code must
// narrow each value before using it.

export interface WorkflowStep {
  readonly uses?: unknown;
  readonly run?: unknown;
  readonly with?: unknown;
}

export interface WorkflowJob {
  readonly 'uses'?: unknown;
  readonly 'steps'?: unknown;
  readonly 'secrets'?: unknown;
  readonly 'permissions'?: unknown;
  readonly 'runs-on'?: unknown;
}

export interface WorkflowDocument {
  readonly on?: unknown;
  readonly permissions?: unknown;
  readonly jobs?: unknown;
  /** Composite actions: `runs.steps`. */
  readonly runs?: unknown;
}

/** Result of parsing one workflow file. */
export type ParsedWorkflow =
  | { readonly ok: true; readonly doc: WorkflowDocument }
  | { readonly ok: false; readonly error: string };

/** Write scopes granted by a `permissions:` value. `'*'` stands for `write-all`. */
export interface WriteScopes {
  /** Whether a `permissions:` key was present at all. */
  readonly set: boolean;
  readonly writes: ReadonlySet<string>;
}

export interface AnalyzeOptions {
  /** Action owners treated as trusted (compared case-insensitively). */
  readonly trustedOwners?: readonly string[];
}
