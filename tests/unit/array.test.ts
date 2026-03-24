import { describe, it, expect } from 'vitest';
import { chunk, unique, groupBy, sum } from '@src/utils/array.js';

describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk when size >= array length', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 2)).toEqual([]);
  });

  it('throws when size is 0 or negative', () => {
    expect(() => chunk([1, 2], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2], -1)).toThrow(RangeError);
  });
});

describe('unique', () => {
  it('removes duplicate values', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('handles string arrays', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns same array when all values are unique', () => {
    expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('groupBy', () => {
  const users = [
    { name: 'Alice', role: 'admin' },
    { name: 'Bob', role: 'user' },
    { name: 'Charlie', role: 'admin' },
  ];

  it('groups items by a key', () => {
    const result = groupBy(users, 'role');
    expect(result['admin']).toHaveLength(2);
    expect(result['user']).toHaveLength(1);
  });

  it('preserves item data in groups', () => {
    const result = groupBy(users, 'role');
    expect(result['admin']![0]!.name).toBe('Alice');
  });

  it('returns empty object for empty array', () => {
    expect(groupBy([], 'role')).toEqual({});
  });
});

describe('sum', () => {
  it('sums an array of numbers', () => {
    expect(sum([1, 2, 3, 4, 5])).toBe(15);
  });

  it('returns 0 for empty array', () => {
    expect(sum([])).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(sum([-1, -2, 3])).toBe(0);
  });

  it('handles a single-element array', () => {
    expect(sum([42])).toBe(42);
  });
});
