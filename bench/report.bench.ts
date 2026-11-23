// Turning engine output into the final report: parsing tool JSON, de-duplicating, sorting,
// escaping for the PR comment and building SARIF. Sized like a large monorepo's first scan.
import { describe, it } from 'vitest';

import {
  dedupe,
  parseOsv,
  parseSemgrep,
  renderReport,
  sortFindings,
  toSarif,
} from '@libs';
import { escapeTableCell } from '@utils';

import { findings, osvOutput, RUN, semgrepOutput } from './fixtures';

describe('reporting', () => {
  it('engine output parsing', async ({ bench }) => {
    const osv = osvOutput(3_000);
    const semgrep = semgrepOutput(10_000);
    await bench.compare(
      bench('parseOsv: 3 000 vulnerable packages in 3 lockfiles', () => {
        parseOsv(osv, '/repo');
      }),
      bench('parseSemgrep: 10 000 results', () => {
        parseSemgrep(semgrep, '/repo');
      }),
      RUN,
    );
  });

  it('findings to report and SARIF', async ({ bench }) => {
    const many = findings(10_000);
    const withDuplicates = [...many, ...many.slice(0, 5_000)];
    const sorted = sortFindings(many);
    const hostile = '<script>|`'.repeat(10_000);
    await bench.compare(
      bench('dedupe: 15 000 findings (5 000 duplicates)', () => {
        dedupe(withDuplicates);
      }),
      bench('sortFindings: 10 000 findings', () => {
        sortFindings(many);
      }),
      bench('renderReport: job summary, 300 of 10 000 rows', () => {
        renderReport({
          findings: sorted,
          languages: [{ name: 'TypeScript', files: 4_000 }],
          ecosystems: [{ name: 'npm' }],
          engines: [{ check: 'code', tool: 'semgrep', status: 'ran' }],
          scope: 'all',
          maxRows: 300,
        });
      }),
      bench('toSarif: 10 000 findings', () => {
        toSarif(sorted, '1.0.0');
      }),
      bench('escapeTableCell: 100 KB that all needs escaping', () => {
        escapeTableCell(hostile);
      }),
      RUN,
    );
  });
});
