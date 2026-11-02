/**
 * Ascending id order used everywhere ids are listed (BR13).
 *
 * Compares the UTF-8 bytes of both strings, which is exactly what Postgres does
 * for `COLLATE "C"`. A plain `a < b` compares UTF-16 code units instead, which
 * disagrees with byte order for some characters outside the BMP.
 */
export function compareIds(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
