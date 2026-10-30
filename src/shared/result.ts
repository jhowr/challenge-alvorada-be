/**
 * Expected business failures are returned as values instead of thrown, so the
 * compiler forces every caller to handle them. Exceptions are reserved for
 * unexpected failures (e.g. the database being down).
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
