// SARIF 2.1.0 output for GitHub code scanning.
import { SEVERITY_RANK } from '@utils';

import { CHECK_LABEL, TOOL_NAME, TOOL_URL } from './labels';

import type {
  Finding,
  SarifLevel,
  SarifLog,
  SarifResult,
  SarifRule,
  Severity,
} from '@types';

const LEVEL: Readonly<Record<Severity, SarifLevel>> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
};

/** GitHub maps `security-severity` (0–10) to its own Critical/High/Medium/Low. */
const SECURITY_SEVERITY: Readonly<Record<Severity, string>> = {
  critical: '9.5',
  high: '8.0',
  medium: '5.5',
  low: '2.0',
};

const ruleFor = (id: string, f: Finding): SarifRule => ({
  id,
  name: f.rule,
  shortDescription: { text: `${CHECK_LABEL[f.check]}: ${f.rule}` },
  properties: {
    'tags': ['security', f.check, f.tool],
    'security-severity': SECURITY_SEVERITY[f.severity],
  },
});

const resultFor = (id: string, f: Finding): SarifResult => ({
  ruleId: id,
  level: LEVEL[f.severity],
  message: { text: f.message.replace(/\*\*/g, '') },
  locations: [
    {
      physicalLocation: {
        artifactLocation: { uri: f.file || '.' },
        region: { startLine: Math.max(1, f.line ?? 1) },
      },
    },
  ],
});

export function toSarif(findings: readonly Finding[], version: string): SarifLog {
  // One rule per check/rule id, carrying the highest severity seen for it.
  const rules = new Map<string, { severity: Severity; rule: SarifRule }>();
  const results: SarifResult[] = [];
  for (const f of findings) {
    const id = `${f.check}/${f.rule}`;
    const previous = rules.get(id);
    if (!previous || SEVERITY_RANK[f.severity] > SEVERITY_RANK[previous.severity]) {
      rules.set(id, { severity: f.severity, rule: ruleFor(id, f) });
    }
    results.push(resultFor(id, f));
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version,
            informationUri: TOOL_URL,
            rules: [...rules.values()].map((r) => r.rule),
          },
        },
        results,
      },
    ],
  };
}
