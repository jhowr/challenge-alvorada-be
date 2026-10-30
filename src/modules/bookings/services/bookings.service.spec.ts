import { InMemoryResourcesRepository } from '../../resources/repositories/in-memory-resources.repository.js';
import { ResourcesService } from '../../resources/services/resources.service.js';
import { InMemoryBookingsRepository } from '../repositories/in-memory-bookings.repository.js';
import { AvailabilityService } from './availability.service.js';
import { BookingsService } from './bookings.service.js';

function setup() {
  const repository = new InMemoryBookingsRepository();
  const resources = new ResourcesService(
    new InMemoryResourcesRepository(['R1', 'R2']),
  );
  return {
    bookings: new BookingsService(repository, resources),
    availability: new AvailabilityService(repository, resources),
    snapshot: () => repository.list({}),
  };
}

const book = (id: string, resourceId: string, start: number, end: number) => ({
  id,
  resourceId,
  start,
  end,
});

describe('BookingsService', () => {
  it('accepts the example from the challenge statement', async () => {
    const { bookings, availability } = setup();

    expect((await bookings.create(book('A', 'R1', 10, 20))).ok).toBe(true);
    expect((await bookings.create(book('B', 'R1', 20, 30))).ok).toBe(true);
    expect(await bookings.create(book('C', 'R1', 19, 21))).toEqual({
      ok: false,
      error: { code: 'conflict', conflictingIds: ['A', 'B'] },
    });
    expect((await bookings.create(book('C', 'R2', 19, 21))).ok).toBe(true);

    const query = { resourceId: 'R1', start: 19, end: 21 };
    const before = await availability.check(query);
    expect(before.ok && before.value.conflicts.map((b) => b.id)).toEqual([
      'A',
      'B',
    ]);

    await bookings.cancel('A');
    const after = await availability.check({
      resourceId: 'R1',
      start: 10,
      end: 20,
    });
    expect(after.ok && after.value.available).toBe(true);
    expect(await bookings.create(book('A', 'R1', 0, 5))).toEqual({
      ok: false,
      error: { code: 'id_already_used', id: 'A' },
    });
  });

  describe('create', () => {
    it('BR3 — a booking may start exactly when another ends', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));

      expect((await bookings.create(book('B', 'R1', 20, 30))).ok).toBe(true);
      expect((await bookings.create(book('C', 'R1', 0, 10))).ok).toBe(true);
    });

    it('BR3 — a single overlapping unit is a conflict', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));

      expect(await bookings.create(book('B', 'R1', 19, 30))).toMatchObject({
        ok: false,
        error: { code: 'conflict', conflictingIds: ['A'] },
      });
    });

    it('BR4 — different resources can be booked for the same period', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));

      expect((await bookings.create(book('B', 'R2', 10, 20))).ok).toBe(true);
    });

    it('BR4/BR7 — a cancelled booking does not block its period', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));
      await bookings.cancel('A');

      expect((await bookings.create(book('B', 'R1', 10, 20))).ok).toBe(true);
    });

    it.each([
      ['a conflict', book('X', 'R1', 15, 25), 'conflict'],
      ['an unknown resource', book('X', 'R9', 0, 5), 'resource_not_found'],
      ['invalid data', book('X', 'R1', 5, 5), 'validation_error'],
    ])(
      'BR5 — an attempt rejected by %s does not take the id',
      async (_label, attempt, code) => {
        const { bookings, snapshot } = setup();
        await bookings.create(book('A', 'R1', 10, 20));
        const before = await snapshot();

        expect(await bookings.create(attempt)).toMatchObject({
          ok: false,
          error: { code },
        });
        expect(await snapshot()).toEqual(before);
        expect((await bookings.create(book('X', 'R2', 0, 5))).ok).toBe(true);
      },
    );

    it('BR6 — an id is never reused, even after cancellation', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));
      await bookings.cancel('A');

      expect(await bookings.create(book('A', 'R2', 50, 60))).toEqual({
        ok: false,
        error: { code: 'id_already_used', id: 'A' },
      });
    });

    it('BR14 — reports every conflicting booking in ascending id order', async () => {
      const { bookings } = setup();
      await bookings.create(book('9', 'R1', 0, 10));
      await bookings.create(book('10', 'R1', 10, 20));
      await bookings.create(book('B', 'R1', 20, 30));
      await bookings.create(book('a', 'R1', 30, 40));

      expect(await bookings.create(book('X', 'R1', 5, 35))).toEqual({
        ok: false,
        error: { code: 'conflict', conflictingIds: ['10', '9', 'B', 'a'] },
      });
    });

    it('checks in order: validation → resource → id → overlap', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));

      // Unknown resource AND used id → the resource error wins.
      expect(await bookings.create(book('A', 'R9', 10, 20))).toMatchObject({
        error: { code: 'resource_not_found' },
      });
      // Used id AND overlap → the id error wins.
      expect(await bookings.create(book('A', 'R1', 10, 20))).toMatchObject({
        error: { code: 'id_already_used' },
      });
      // Invalid period AND unknown resource → validation wins.
      expect(await bookings.create(book('B', 'R9', 20, 10))).toMatchObject({
        error: { code: 'validation_error' },
      });
    });
  });

  describe('cancel', () => {
    it('BR7 — cancels an active booking', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));

      expect(await bookings.cancel('A')).toEqual({
        ok: true,
        value: {
          outcome: 'cancelled',
          booking: { ...book('A', 'R1', 10, 20), status: 'cancelled' },
        },
      });
    });

    it('BR8 — cancelling twice returns already_cancelled and changes nothing', async () => {
      const { bookings, snapshot } = setup();
      await bookings.create(book('A', 'R1', 10, 20));
      await bookings.cancel('A');
      const before = await snapshot();

      const result = await bookings.cancel('A');

      expect(result.ok && result.value.outcome).toBe('already_cancelled');
      expect(await snapshot()).toEqual(before);
    });

    it('BR9 — cancelling an unknown id is an error', async () => {
      const { bookings } = setup();

      expect(await bookings.cancel('nope')).toEqual({
        ok: false,
        error: { code: 'booking_not_found', id: 'nope' },
      });
    });
  });

  describe('list and findById', () => {
    it('BR12 — lists bookings in ascending id order, filtered by status and resource', async () => {
      const { bookings } = setup();
      await bookings.create(book('B', 'R1', 0, 10));
      await bookings.create(book('A', 'R1', 10, 20));
      await bookings.create(book('C', 'R2', 0, 10));
      await bookings.cancel('B');

      const ids = async (filter: object) => {
        const result = await bookings.list(filter);
        return result.ok ? result.value.map((b) => b.id) : result.error;
      };

      expect(await ids({})).toEqual(['A', 'B', 'C']);
      expect(await ids({ status: 'active' })).toEqual(['A', 'C']);
      expect(await ids({ status: 'cancelled' })).toEqual(['B']);
      expect(await ids({ resourceId: 'R1', status: 'active' })).toEqual(['A']);
      expect(await ids({ status: 'deleted' })).toMatchObject({
        code: 'validation_error',
      });
    });

    it('BR12 — finds a booking by id with its status', async () => {
      const { bookings } = setup();
      await bookings.create(book('A', 'R1', 10, 20));

      expect(await bookings.findById('A')).toEqual({
        ok: true,
        value: { ...book('A', 'R1', 10, 20), status: 'active' },
      });
      expect(await bookings.findById('Z')).toMatchObject({
        error: { code: 'booking_not_found' },
      });
    });

    it('returned bookings are copies that cannot change the store', async () => {
      const { bookings, snapshot } = setup();
      const created = await bookings.create(book('A', 'R1', 10, 20));
      if (created.ok) created.value.status = 'cancelled';

      expect((await snapshot())[0]?.status).toBe('active');
    });
  });
});
