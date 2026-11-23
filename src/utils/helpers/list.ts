/** Split a comma- or newline-separated action input into trimmed, non-empty items. */
export const parseList = (value: string | null | undefined): string[] =>
  String(value ?? '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/** Remove duplicates, keeping the first occurrence's order. */
export const unique = <T>(items: Iterable<T>): T[] => [...new Set(items)];
