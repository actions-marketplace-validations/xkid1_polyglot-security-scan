// Tool versions come from action inputs and end up in download URLs, cache paths and a
// `pip install semgrep==<version>` argument. Only plain numeric versions are accepted,
// so an input can never smuggle in a path, URL, pip option or extra requirement.
const STRICT_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export function isStrictVersion(version: string): boolean {
  return STRICT_VERSION.test(version);
}

/** Throw unless `version` looks like `1.2.3`. */
export function assertStrictVersion(tool: string, version: string): void {
  if (!isStrictVersion(version)) {
    throw new Error(
      `Invalid ${tool} version "${version}": expected MAJOR.MINOR.PATCH, e.g. 1.2.3.`,
    );
  }
}
