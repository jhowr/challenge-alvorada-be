import type { BookingsRepository } from '../../src/modules/bookings/repositories/bookings.repository.js';

/**
 * Behaviour every BookingsRepository must share. Running the same suite
 * against the in-memory and the Postgres implementations proves the API
 * behaves the same whichever DB_DRIVER is used.
 */
export function bookingsRepositoryContract(
  name: string,
  makeRepository: () => Promise<BookingsRepository>,
): void {
  describe(`${name} — BookingsRepository contract`, () => {
    let repository: BookingsRepository;
    const insert = (
      id: string,
      resourceId: string,
      start: number,
      end: number,
    ) => repository.insert({ id, resourceId, start, end });

    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('stores and returns an active booking', async () => {
      expect(await insert('A', 'R1', 10, 20)).toEqual({
        ok: true,
        value: {
          id: 'A',
          resourceId: 'R1',
          start: 10,
          end: 20,
          status: 'active',
        },
      });
      expect(await repository.findById('A')).toEqual({
        id: 'A',
        resourceId: 'R1',
        start: 10,
        end: 20,
        status: 'active',
      });
      expect(await repository.findById('Z')).toBeNull();
    });

    it('BR3 — accepts adjacent periods and rejects overlaps', async () => {
      await insert('A', 'R1', 10, 20);

      expect((await insert('B', 'R1', 20, 30)).ok).toBe(true);
      expect((await insert('C', 'R1', 0, 10)).ok).toBe(true);
      expect(await insert('D', 'R1', 19, 21)).toEqual({
        ok: false,
        error: { code: 'conflict', conflictingIds: ['A', 'B'] },
      });
      expect(await repository.findById('D')).toBeNull();
    });

    it('BR4 — overlap only matters within the same resource', async () => {
      await insert('A', 'R1', 10, 20);

      expect((await insert('B', 'R2', 10, 20)).ok).toBe(true);
    });

    it('BR6 — rejects a used id, even when the booking is cancelled', async () => {
      await insert('A', 'R1', 10, 20);
      await repository.cancelIfActive('A');

      expect(await insert('A', 'R2', 50, 60)).toEqual({
        ok: false,
        error: { code: 'id_already_used', id: 'A' },
      });
    });

    it('BR7 — cancelIfActive frees the period once', async () => {
      await insert('A', 'R1', 10, 20);

      expect(await repository.cancelIfActive('A')).toMatchObject({
        id: 'A',
        status: 'cancelled',
      });
      expect(await repository.cancelIfActive('A')).toBeNull();
      expect(await repository.cancelIfActive('Z')).toBeNull();
      expect((await insert('B', 'R1', 10, 20)).ok).toBe(true);
    });

    it('BR10 — findActiveConflicts ignores cancelled bookings and other resources', async () => {
      await insert('A', 'R1', 10, 20);
      await insert('B', 'R1', 20, 30);
      await insert('C', 'R2', 10, 30);
      await repository.cancelIfActive('B');

      const conflicts = await repository.findActiveConflicts('R1', {
        start: 0,
        end: 100,
      });
      expect(conflicts.map((booking) => booking.id)).toEqual(['A']);
    });

    it('BR13 — orders ids by bytes ("10" < "9" < "B" < "a")', async () => {
      await insert('a', 'R1', 0, 10);
      await insert('9', 'R1', 10, 20);
      await insert('B', 'R1', 20, 30);
      await insert('10', 'R1', 30, 40);

      const expected = ['10', '9', 'B', 'a'];
      const conflicts = await repository.findActiveConflicts('R1', {
        start: 0,
        end: 40,
      });
      expect(conflicts.map((booking) => booking.id)).toEqual(expected);
      expect((await repository.list({})).map((booking) => booking.id)).toEqual(
        expected,
      );
    });

    it('BR12 — list filters by status and resource', async () => {
      await insert('A', 'R1', 0, 10);
      await insert('B', 'R1', 10, 20);
      await insert('C', 'R2', 0, 10);
      await repository.cancelIfActive('B');

      const ids = async (filter: Parameters<BookingsRepository['list']>[0]) =>
        (await repository.list(filter)).map((booking) => booking.id);

      expect(await ids({})).toEqual(['A', 'B', 'C']);
      expect(await ids({ status: 'cancelled' })).toEqual(['B']);
      expect(await ids({ status: 'active', resourceId: 'R1' })).toEqual(['A']);
      expect(await ids({ resourceId: 'R3' })).toEqual([]);
    });

    it('handles int32 boundaries', async () => {
      const min = -(2 ** 31);
      const max = 2 ** 31 - 1;
      await insert('A', 'R1', min, max);

      expect(await repository.findById('A')).toMatchObject({
        start: min,
        end: max,
      });
      expect((await insert('B', 'R1', max - 1, max)).ok).toBe(false);
    });
  });
}
