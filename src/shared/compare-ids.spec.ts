import { compareIds } from './compare-ids.js';

describe('compareIds', () => {
  it('BR13 — orders ids by bytes, not numerically nor case-insensitively', () => {
    expect(['9', '10', 'a', 'B'].sort(compareIds)).toEqual([
      '10',
      '9',
      'B',
      'a',
    ]);
  });

  it('agrees with UTF-8 byte order for characters outside the BMP', () => {
    // U+FF5E (BMP) has a higher UTF-16 code unit than the surrogate pair of
    // U+1F600, but a lower UTF-8 byte sequence, matching Postgres COLLATE "C".
    expect(['😀', '～'].sort(compareIds)).toEqual(['～', '😀']);
  });

  it('returns 0 for equal ids', () => {
    expect(compareIds('A', 'A')).toBe(0);
  });
});
