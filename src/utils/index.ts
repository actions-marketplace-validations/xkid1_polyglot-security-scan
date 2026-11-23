// @utils: generic, domain-free helpers. May depend only on @types.
export {
  isBinary,
  isInsideOrEqual,
  listFiles,
  pathExists,
  readTextFile,
  resolveInside,
  toPosix,
  type ListFilesOptions,
  type ReadTextOptions,
} from './fs';
export { globToRegExp, makeMatcher } from './glob';
export {
  errorMessage,
  errorStatus,
  isOneOf,
  isRecord,
  ownValue,
  parseJson,
  parseList,
  singleLineError,
  unique,
} from './helpers';
export {
  bySeverityDesc,
  emptySeverityCounts,
  meetsThreshold,
  SEVERITIES,
  SEVERITY_RANK,
} from './severity';
export {
  asText,
  clip,
  collapseWhitespace,
  escapeCodeSpan,
  escapeTableCell,
  lineAt,
  nonEmptyOr,
} from './text';
