// Minimal glob support for the `exclude` input: `*`, `**`, `?` and a trailing `/`
// (meaning "everything under this directory"). Every other character is literal.

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;
const GLOBSTAR = '\u0000';

/** Convert one glob to an anchored regular expression, or `null` for a blank pattern. */
export function globToRegExp(pattern: string): RegExp | null {
  let glob = pattern.trim().replace(/^\.\//, '');
  if (!glob) return null;
  if (glob.endsWith('/')) glob += '**';
  const source = glob
    .replace(REGEX_SPECIAL, '\\$&')
    .replace(/\*\*\/?/g, GLOBSTAR)
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replaceAll(GLOBSTAR, '.*');
  // The source is built only from escaped literals and fixed fragments above.
  // eslint-disable-next-line security/detect-non-literal-regexp -- input is fully escaped
  return new RegExp(`^${source}$`);
}

/** Build a predicate that is true when a repository-relative path matches any glob. */
export function makeMatcher(patterns: readonly string[]): (file: string) => boolean {
  const regexes = patterns.map(globToRegExp).filter((re): re is RegExp => re !== null);
  return (file) => regexes.some((re) => re.test(file));
}
