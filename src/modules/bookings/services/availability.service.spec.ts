import { InMemoryResourcesRepository } from '../../resources/repositories/in-memory-resources.repository.js';
import { ResourcesService } from '../../resources/services/resources.service.js';
import { InMemoryBookingsRepository } from '../repositories/in-memory-bookings.repository.js';
import { AvailabilityService } from './availability.service.js';
import { BookingsService } from './bookings.service.js';

async function setup() {
  const repository = new InMemoryBookingsRepository();
  const resources = new ResourcesService(
    new InMemoryResourcesRepository(['R1', 'R2']),
  );
  const bookings = new BookingsService(repository, resources);
  await bookings.create({ id: 'B', resourceId: 'R1', start: 20, end: 30 });
  await bookings.create({ id: 'A', resourceId: 'R1', start: 10, end: 20 });
  await bookings.create({ id: 'C', resourceId: 'R1', start: 40, end: 50 });
  await bookings.cancel('C');
  return {
    availability: new AvailabilityService(repository, resources),
    snapshot: () => repository.list({}),
  };
}

describe('AvailabilityService', () => {
  it('BR10 — lists active conflicts in ascending id order', async () => {
    const { availability } = await setup();

    const result = await availability.check({
      resourceId: 'R1',
      start: 15,
      end: 25,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toBe(false);
    expect(result.value.conflicts.map((b) => b.id)).toEqual(['A', 'B']);
  });

  it('BR10 — a period adjacent to bookings is available', async () => {
    const { availability } = await setup();

    const result = await availability.check({
      resourceId: 'R1',
      start: 30,
      end: 40,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { available: true, conflicts: [] },
    });
  });

  it('BR4 — cancelled bookings and other resources do not conflict', async () => {
    const { availability } = await setup();

    expect(
      await availability.check({ resourceId: 'R1', start: 40, end: 50 }),
    ).toMatchObject({ value: { available: true } });
    expect(
      await availability.check({ resourceId: 'R2', start: 10, end: 30 }),
    ).toMatchObject({ value: { available: true } });
  });

  it('BR10 — checking does not change any data', async () => {
    const { availability, snapshot } = await setup();
    const before = await snapshot();

    await availability.check({ resourceId: 'R1', start: 0, end: 100 });

    expect(await snapshot()).toEqual(before);
  });

  it.each([
    [
      'an unknown resource',
      { resourceId: 'R9', start: 0, end: 5 },
      'resource_not_found',
    ],
    [
      'an empty period',
      { resourceId: 'R1', start: 5, end: 5 },
      'validation_error',
    ],
    ['a missing boundary', { resourceId: 'R1', start: 5 }, 'validation_error'],
  ])('BR11 — rejects %s', async (_label, query, code) => {
    const { availability } = await setup();

    expect(await availability.check(query)).toMatchObject({
      ok: false,
      error: { code },
    });
  });
});
