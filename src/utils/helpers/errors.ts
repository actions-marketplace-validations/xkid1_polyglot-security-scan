/** Message of any thrown value, without assuming it is an `Error`. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** HTTP status of an Octokit `RequestError` (or anything with a numeric `status`). */
export function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error))
    return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

/** A thrown value's message on one line (also unescapes literal `\n` from tool output). */
export const singleLineError = (error: unknown): string =>
  errorMessage(error)
    .replace(/\\r\\n|\\n|\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
