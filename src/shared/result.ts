export type Result<T, E> = { ok: true; data: T } | { ok: false; error: E };

export const success = <T, E = never>(data: T): Result<T, E> => ({
	ok: true,
	data,
});

export const failure = <E, T = never>(error: E): Result<T, E> => ({
	ok: false,
	error,
});
