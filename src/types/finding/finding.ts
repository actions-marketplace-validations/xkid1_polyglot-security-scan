/** How serious a finding is. Ordered from least to most severe. */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** The five independent checks the action can run. */
export type CheckId = 'dependencies' | 'code' | 'secrets' | 'malware' | 'workflows';

/** One unified finding, whatever engine produced it. */
export interface Finding {
  readonly check: CheckId;
  /** Engine that produced the finding, e.g. `semgrep` or `built-in`. */
  readonly tool: string;
  readonly severity: Severity;
  /** Stable rule identifier within the check, e.g. `reverse-shell`. */
  readonly rule: string;
  /** Repository-relative path using `/` separators (`''` when unknown). */
  readonly file: string;
  /** 1-based line number, when the engine reports one. */
  readonly line?: number | undefined;
  /** Human-readable explanation. May contain light Markdown (`code`, **bold**). */
  readonly message: string;
}

/** What each check or engine returns. */
export interface EngineResult {
  readonly findings: readonly Finding[];
  /** Short extra context shown in the "Checks that ran" table. */
  readonly note?: string | undefined;
}

/** Status row shown in the "Checks that ran" table. */
export interface EngineStatus {
  readonly check: CheckId;
  readonly tool: string;
  readonly status: string;
  readonly note?: string | undefined;
}
