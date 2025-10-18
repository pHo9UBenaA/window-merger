/**
 * Pure array utility functions.
 * These are generic, non-domain-specific helpers.
 */

/**
 * Sorts an array by a comparator function without mutating the original.
 * @param arr - The array to sort.
 * @param compareFn - Comparison function.
 * @returns A new sorted array.
 */
export const sortBy = <T>(arr: readonly T[], compareFn: (a: T, b: T) => number): T[] =>
	[...arr].sort(compareFn);
