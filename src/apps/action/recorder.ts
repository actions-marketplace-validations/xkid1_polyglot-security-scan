import * as core from '@actions/core';

import { singleLineError } from '@utils';

import type { CheckId, EngineResult, EngineStatus, Finding } from '@types';

const MAX_NOTE_LENGTH = 160;

/**
 * Collects findings and per-engine status. A failing engine is recorded as failed and
 * reported as a warning, so one broken scanner never hides the results of the others.
 */
export class CheckRecorder {
  readonly findings: Finding[] = [];
  readonly engines: EngineStatus[] = [];
  readonly #enabled: ReadonlySet<CheckId>;

  constructor(enabled: ReadonlySet<CheckId>) {
    this.#enabled = enabled;
  }

  isEnabled(check: CheckId): boolean {
    return this.#enabled.has(check);
  }

  /** Run one engine inside a collapsed log group, if its check is enabled. */
  async run(
    check: CheckId,
    tool: string,
    fn: () => Promise<EngineResult>,
  ): Promise<void> {
    if (!this.isEnabled(check)) return;
    try {
      const { findings, note } = await core.group(`${check}: ${tool}`, fn);
      this.findings.push(...findings);
      const plural = findings.length === 1 ? '' : 's';
      this.engines.push({
        check,
        tool,
        status: `✅ ran (${findings.length} finding${plural})`,
        note,
      });
    } catch (error) {
      const message = singleLineError(error);
      core.warning(`${tool} (${check}) failed: ${message}`);
      this.engines.push({
        check,
        tool,
        status: '⚠️ failed',
        note: message.slice(0, MAX_NOTE_LENGTH),
      });
    }
  }

  /** Record that an enabled check was skipped, and why. */
  skip(check: CheckId, tool: string, why: string): void {
    if (this.isEnabled(check))
      this.engines.push({ check, tool, status: `⏭️ skipped — ${why}` });
  }
}
