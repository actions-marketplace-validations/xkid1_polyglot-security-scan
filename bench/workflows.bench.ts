// Workflow analysis runs per changed workflow file (up to 1 MB, fetched from the PR head).
// The PR author controls that text, so the adversarial cases matter: a slow path here
// would let any PR stall the check.
import { describe, it } from 'vitest';

import { analyzeWorkflow, parseWorkflow } from '@libs';

import { kb, RUN, unterminatedExpressions, workflowYaml } from './fixtures';

const FILE = '.github/workflows/ci.yml';

describe('workflow analysis', () => {
  it('realistic workflows', async ({ bench }) => {
    const small = workflowYaml(3, 5);
    const large = workflowYaml(100, 20);
    const largeChanged = workflowYaml(
      100,
      20,
      '      - run: echo "${{ github.event.pull_request.title }}"\n      - uses: someone/tool@main',
    );
    await bench.compare(
      bench('parse a 3-job workflow', () => {
        parseWorkflow(small);
      }),
      bench(`parse a 100-job workflow (${kb(large.length)})`, () => {
        parseWorkflow(large);
      }),
      bench('analyze: unchanged 3-job workflow', () => {
        analyzeWorkflow(small, small, FILE);
      }),
      bench('analyze: 100 jobs, injection + branch ref added to each', () => {
        analyzeWorkflow(large, largeChanged, FILE);
      }),
      bench('analyze: brand-new 100-job workflow', () => {
        analyzeWorkflow(null, large, FILE);
      }),
      RUN,
    );
  });

  it('unterminated ${{ github.… expressions (ReDoS check)', async ({ bench }) => {
    // Doubling the input should roughly double the time. Quadratic growth (4×) means the
    // untrusted-expression regex backtracks from every unclosed `${{`.
    const cases = (['safe', 'untrusted'] as const).flatMap((field) =>
      [500, 1000, 2000, 4000].map((count) => {
        const text = unterminatedExpressions(count, field);
        return bench(`${field} field, ${count} openings (${kb(text.length)})`, () => {
          analyzeWorkflow(null, text, FILE);
        });
      }),
    );
    await bench.compare(...cases, RUN);
  });
});
