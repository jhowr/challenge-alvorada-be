import { mockOf } from '../../../../test/helpers/mock-of';
import type { ResourcesRepository } from '../../resources/repositories/resources.repository';
import { ResourcesService } from '../../resources/services/resources.service';
import type { Booking } from '../booking.types';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { AvailabilityService } from './availability.service';

const active = (id: string, start: number, end: number): Booking => ({
  id,
  resourceId: 'R1',
  start,
  end,
  status: 'active',
});

function setup() {
  const bookings = mockOf<BookingsRepository>({
    findById: vi.fn(),
    list: vi.fn(),
    findActiveConflicts: vi.fn().mockResolvedValue([]),
    insert: vi.fn(),
    cancelIfActive: vi.fn(),
  });
  const resources = mockOf<ResourcesRepository>({
    list: vi.fn(),
    exists: vi.fn().mockResolvedValue(true),
  });
  const service = new AvailabilityService(
    bookings,
    new ResourcesService(resources),
  );
  return { service, bookings, resources };
}

describe('AvailabilityService', () => {
  it('BR10 — an overlapped period is unavailable and lists the conflicts', async () => {
    const { service, bookings } = setup();
    const conflicts = [active('A', 10, 20), active('B', 20, 30)];
    bookings.findActiveConflicts.mockResolvedValue(conflicts);

    await expect(
      service.check({ resourceId: 'R1', start: 15, end: 25 }),
    ).resolves.toEqual({
      resourceId: 'R1',
      start: 15,
      end: 25,
      available: false,
      conflicts,
    });
    expect(bookings.findActiveConflicts).toHaveBeenCalledWith('R1', {
      resourceId: 'R1',
      start: 15,
      end: 25,
    });
  });

  it('BR10 — a period without active conflicts is available', async () => {
    const { service } = setup();

    await expect(
      service.check({ resourceId: 'R1', start: 30, end: 40 }),
    ).resolves.toMatchObject({ available: true, conflicts: [] });
  });

  it('BR10 — checking never writes', async () => {
    const { service, bookings } = setup();

    await service.check({ resourceId: 'R1', start: 0, end: 100 });

    expect(bookings.insert).not.toHaveBeenCalled();
    expect(bookings.cancelIfActive).not.toHaveBeenCalled();
  });

  it('BR11 — an unknown resource is an error', async () => {
    const { service, bookings, resources } = setup();
    resources.exists.mockResolvedValue(false);

    await expect(
      service.check({ resourceId: 'R9', start: 0, end: 5 }),
    ).rejects.toMatchObject({ code: 'resource_not_found', resourceId: 'R9' });
    expect(bookings.findActiveConflicts).not.toHaveBeenCalled();
  });
});
