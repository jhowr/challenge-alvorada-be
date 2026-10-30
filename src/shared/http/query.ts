const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Query string values always arrive as strings. Turns numeric-looking values
 * into numbers and leaves everything else untouched, so the domain validator
 * still reports the original value (`""` must not silently become 0).
 */
export function coerceNumeric(value: unknown): unknown {
  return typeof value === 'string' && NUMERIC.test(value)
    ? Number(value)
    : value;
}
