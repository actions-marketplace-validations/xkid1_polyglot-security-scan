/** A non-null, non-array object. Use it to narrow parsed JSON/YAML before reading keys. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Narrow a string to one of a fixed set of literals. */
export const isOneOf = <T extends string>(
  allowed: readonly T[],
  value: string,
): value is T => (allowed as readonly string[]).includes(value);

/** Own-property lookup: never returns values inherited from `Object.prototype`. */
export function ownValue<T>(
  table: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
