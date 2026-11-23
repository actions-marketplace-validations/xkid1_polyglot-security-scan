/**
 * Text from an untrusted value: strings as-is, numbers and booleans stringified, and
 * anything else (objects, arrays, null, undefined) as `''`. Never yields `[object Object]`.
 */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** `value` unless it is undefined or empty, otherwise `fallback`. */
export const nonEmptyOr = (value: string | undefined, fallback: string): string =>
  value === undefined || value === '' ? fallback : value;

/** Collapse all whitespace (including newlines) to single spaces and trim. */
export const collapseWhitespace = (value: unknown): string =>
  asText(value).replace(/\s+/g, ' ').trim();

/** Collapse whitespace and cut to at most `max` characters, ending with `…` when cut. */
export function clip(value: unknown, max = 300): string {
  const text = collapseWhitespace(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Make untrusted text safe inside a Markdown table cell of a PR comment: escapes the
 * column separator (and backslashes, so `\|` cannot be smuggled in), removes line
 * breaks and neutralises raw HTML tags.
 */
export const escapeTableCell = (value: unknown): string =>
  asText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Make untrusted text safe inside a single-backtick Markdown code span. */
export const escapeCodeSpan = (value: unknown): string =>
  asText(value).replace(/`/g, "'").replace(/\r?\n/g, ' ');

/** 1-based line number of the character at `index`. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
