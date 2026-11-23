import { errorMessage } from './errors';

/**
 * Parse JSON from an external tool. The result is `unknown` on purpose: callers must
 * narrow it before use. Errors name the source so failures are easy to diagnose.
 */
export function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${source} produced invalid JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}
