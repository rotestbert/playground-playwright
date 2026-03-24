/**
 * Chunks an array into smaller arrays of the given size.
 * e.g. chunk([1,2,3,4,5], 2) -> [[1,2],[3,4],[5]]
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new RangeError('Chunk size must be greater than 0');
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Returns unique values from an array.
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Groups an array of objects by a key.
 */
export function groupBy<T, K extends keyof T>(arr: T[], key: K): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const groupKey = String(item[key]);
    acc[groupKey] ??= [];
    acc[groupKey]!.push(item);
    return acc;
  }, {});
}

/**
 * Returns the sum of a numeric array.
 */
export function sum(arr: number[]): number {
  return arr.reduce((acc, n) => acc + n, 0);
}
