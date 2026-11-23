import type { Scope } from '../action';
import type { DetectedEcosystem, DetectedLanguage } from '../detection';
import type { EngineStatus, Finding } from '../finding';

export interface ReportInput {
  readonly findings: readonly Finding[];
  readonly languages: readonly Pick<DetectedLanguage, 'name' | 'files'>[];
  readonly ecosystems: readonly Pick<DetectedEcosystem, 'name'>[];
  readonly engines: readonly EngineStatus[];
  readonly scope: Scope;
  /** Maximum number of finding rows in the table. */
  readonly maxRows?: number;
}

// ------------------------------------------------------------- SARIF 2.1.0
export type SarifLevel = 'error' | 'warning' | 'note';

export interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: { readonly text: string };
  readonly properties: {
    readonly 'tags': readonly string[];
    readonly 'security-severity': string;
  };
}

export interface SarifResult {
  readonly ruleId: string;
  readonly level: SarifLevel;
  readonly message: { readonly text: string };
  readonly locations: readonly {
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string };
      readonly region: { readonly startLine: number };
    };
  }[];
}

export interface SarifLog {
  readonly $schema: string;
  readonly version: '2.1.0';
  readonly runs: readonly {
    readonly tool: {
      readonly driver: {
        readonly name: string;
        readonly version: string;
        readonly informationUri: string;
        readonly rules: readonly SarifRule[];
      };
    };
    readonly results: readonly SarifResult[];
  }[];
}
