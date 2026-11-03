import { mockOf } from '../../../../test/helpers/mock-of';
import type { ResourcesRepository } from '../../resources/repositories/resources.repository';
import { ResourcesService } from '../../resources/services/resources.service';
import { ConflictError } from '../booking.errors';
import type { Booking, NewBooking } from '../booking.types';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BookingsService } from './bookings.service';

const book = (
  id: string,
  resourceId: string,
  start: number,
  end: number,
): NewBooking => ({ id, resourceId, start, end });

const stored = (
  booking: NewBooking,
  status: Booking['status'] = 'active',
): Booking => ({ ...booking, status });

/** A free resource, an unused id and no overlap, unless a test says otherwise. */
function setup() {
  const bookings = mockOf<BookingsRepository>({
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    findActiveConflicts: vi.fn().mockResolvedValue([]),
    insert: vi.fn(async (booking: NewBooking) => stored(booking)),
    cancelIfActive: vi.fn().mockResolvedValue(null),
  });
  const resources = mockOf<ResourcesRepository>({
    list: vi.fn(),
    exists: vi.fn().mockResolvedValue(true),
  });
  const service = new BookingsService(
    bookings,
    new ResourcesService(resources),
  );
  return { service, bookings, resources };
}

describe('BookingsService', () => {
  describe('create', () => {
    it('stores a booking for a known resource, an unused id and a free period', async () => {
      const { service, bookings } = setup();

      await expect(service.create(book('A', 'R1', 10, 20))).resolves.toEqual(
        stored(book('A', 'R1', 10, 20)),
      );
      expect(bookings.findActiveConflicts).toHaveBeenCalledWith('R1', {
        id: 'A',
        resourceId: 'R1',
        start: 10,
        end: 20,
      });
      expect(bookings.insert).toHaveBeenCalledWith(book('A', 'R1', 10, 20));
    });

    it('BR5 — an unknown resource is rejected without storing anything', async () => {
      const { service, bookings, resources } = setup();
      resources.exists.mockResolvedValue(false);

      await expect(service.create(book('A', 'R9', 0, 5))).rejects.toMatchObject(
        {
          code: 'resource_not_found',
          resourceId: 'R9',
        },
      );
      expect(bookings.insert).not.toHaveBeenCalled();
    });

    it('BR6 — an id is never reused, even by a cancelled booking', async () => {
      const { service, bookings } = setup();
      bookings.findById.mockResolvedValue(
        stored(book('A', 'R1', 10, 20), 'cancelled'),
      );

      await expect(
        service.create(book('A', 'R2', 50, 60)),
      ).rejects.toMatchObject({
        code: 'id_already_used',
        id: 'A',
      });
      expect(bookings.insert).not.toHaveBeenCalled();
    });

    it('BR14 — a conflict names every overlapping booking, in the order found', async () => {
      const { service, bookings } = setup();
      bookings.findActiveConflicts.mockResolvedValue([
        stored(book('10', 'R1', 10, 20)),
        stored(book('9', 'R1', 0, 10)),
      ]);

      await expect(
        service.create(book('X', 'R1', 5, 15)),
      ).rejects.toMatchObject({
        code: 'conflict',
        conflictingIds: ['10', '9'],
      });
      expect(bookings.insert).not.toHaveBeenCalled();
    });

    it('checks in order: resource → id → overlap', async () => {
      const { service, bookings, resources } = setup();
      bookings.findById.mockResolvedValue(stored(book('A', 'R1', 10, 20)));
      bookings.findActiveConflicts.mockResolvedValue([
        stored(book('A', 'R1', 10, 20)),
      ]);

      // Used id AND overlap → the id error wins.
      await expect(
        service.create(book('A', 'R1', 10, 20)),
      ).rejects.toMatchObject({
        code: 'id_already_used',
      });
      // Unknown resource AND used id → the resource error wins.
      resources.exists.mockResolvedValue(false);
      await expect(
        service.create(book('A', 'R9', 10, 20)),
      ).rejects.toMatchObject({
        code: 'resource_not_found',
      });
    });

    it('passes on the rejection of an insert that lost a race', async () => {
      const { service, bookings } = setup();
      // The pre-checks passed, but another request got there first.
      const lost = new ConflictError(['B']);
      bookings.insert.mockRejectedValue(lost);

      await expect(service.create(book('A', 'R1', 10, 20))).rejects.toBe(lost);
    });
  });

  describe('cancel', () => {
    it('BR7 — cancels an active booking', async () => {
      const { service, bookings } = setup();
      const cancelled = stored(book('A', 'R1', 10, 20), 'cancelled');
      bookings.cancelIfActive.mockResolvedValue(cancelled);

      await expect(service.cancel('A')).resolves.toEqual({
        outcome: 'cancelled',
        booking: cancelled,
      });
    });

    it('BR8 — cancelling a cancelled booking returns already_cancelled', async () => {
      const { service, bookings } = setup();
      const cancelled = stored(book('A', 'R1', 10, 20), 'cancelled');
      bookings.findById.mockResolvedValue(cancelled);

      await expect(service.cancel('A')).resolves.toEqual({
        outcome: 'already_cancelled',
        booking: cancelled,
      });
    });

    it('BR9 — cancelling an unknown id is an error', async () => {
      const { service } = setup();

      await expect(service.cancel('nope')).rejects.toMatchObject({
        code: 'booking_not_found',
        id: 'nope',
      });
    });
  });

  describe('findById and list', () => {
    it('BR12 — finds a booking by id with its status', async () => {
      const { service, bookings } = setup();
      bookings.findById.mockResolvedValue(stored(book('A', 'R1', 10, 20)));

      await expect(service.findById('A')).resolves.toEqual(
        stored(book('A', 'R1', 10, 20)),
      );
    });

    it('a missing id is not found', async () => {
      const { service } = setup();

      await expect(service.findById('Z')).rejects.toMatchObject({
        code: 'booking_not_found',
        id: 'Z',
      });
    });

    it('BR12 — lists with the given filter', async () => {
      const { service, bookings } = setup();
      const active = [stored(book('A', 'R1', 10, 20))];
      bookings.list.mockResolvedValue(active);

      expect(await service.list({ status: 'active', resourceId: 'R1' })).toBe(
        active,
      );
      expect(bookings.list).toHaveBeenCalledWith({
        status: 'active',
        resourceId: 'R1',
      });
    });
  });
});
