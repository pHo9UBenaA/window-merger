/**
 * Result type for functional error handling.
 * Represents either a successful result with data or a failure with an error.
 */
export type Result<T, E> = { ok: true; data: T } | { ok: false; error: E };

/**
 * Creates a successful Result.
 * @param data - The successful data value.
 * @returns A Result representing success.
 */
export const success = <T, E = never>(data: T): Result<T, E> => ({
	ok: true,
	data,
});

/**
 * Creates a failed Result.
 * @param error - The error value.
 * @returns A Result representing failure.
 */
export const failure = <E, T = never>(error: E): Result<T, E> => ({
	ok: false,
	error,
});
