import { DatabaseError } from 'pg';
import { PostgresBookingsRepository } from '../../src/modules/bookings/repositories/postgres-bookings.repository.js';
import { BookingsService } from '../../src/modules/bookings/services/bookings.service.js';
import { PostgresResourcesRepository } from '../../src/modules/resources/repositories/postgres-resources.repository.js';
import { ResourcesService } from '../../src/modules/resources/services/resources.service.js';
import { withInsertBarrier } from '../helpers/insert-barrier.repository.js';
import {
  startTestDatabase,
  type TestDatabase,
} from '../helpers/postgres-container.js';
import { bookingsRepositoryContract } from './bookings-repository.contract.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
});

afterAll(async () => {
  await db?.stop();
});

bookingsRepositoryContract('Postgres', async () => {
  await db.reset();
  return new PostgresBookingsRepository(db.pool);
});

describe('Postgres — guarantees beyond the application', () => {
  beforeEach(async () => {
    await db.reset();
  });

  const REQUESTS = 10;
  const racingService = () =>
    new BookingsService(
      withInsertBarrier(new PostgresBookingsRepository(db.pool), REQUESTS),
      new ResourcesService(new PostgresResourcesRepository(db.pool)),
    );

  it('accepts exactly one of many concurrent overlapping bookings', async () => {
    const service = racingService();

    // The barrier lets every request pass the service's pre-checks before any
    // insert lands, so only the exclusion constraint prevents double booking.
    const results = await Promise.all(
      Array.from({ length: REQUESTS }, (_, i) =>
        service.create({
          id: `req-${i}`,
          resourceId: 'ROOM-A',
          start: 100 + i,
          end: 200,
        }),
      ),
    );

    const accepted = results.filter((result) => result.ok);
    const rejected = results.flatMap((result) =>
      result.ok ? [] : [result.error],
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(REQUESTS - 1);
    expect(rejected.every((error) => error.code === 'conflict')).toBe(true);
    const { rows } = await db.pool.query(
      "SELECT count(*)::int AS active FROM bookings WHERE status = 'active'",
    );
    expect(rows[0].active).toBe(1);
  });

  it('accepts exactly one of many concurrent bookings with the same id', async () => {
    const service = racingService();

    const results = await Promise.all(
      Array.from({ length: REQUESTS }, (_, i) =>
        service.create({
          id: 'same',
          resourceId: 'ROOM-A',
          start: i * 10,
          end: i * 10 + 5,
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.every(
        (result) => result.ok || result.error.code === 'id_already_used',
      ),
    ).toBe(true);
  });

  it('rejects an overlapping INSERT that bypasses the application', async () => {
    await db.pool.query(
      "INSERT INTO bookings (id, resource_id, period) VALUES ('A', 'R1', '[10,20)')",
    );

    const attempt = db.pool.query(
      "INSERT INTO bookings (id, resource_id, period) VALUES ('B', 'R1', '[19,21)')",
    );

    await expect(attempt).rejects.toBeInstanceOf(DatabaseError);
    await expect(attempt).rejects.toMatchObject({
      code: '23P01',
      constraint: 'bookings_no_overlap',
    });
  });

  it('rejects an empty period and an unknown resource at the schema level', async () => {
    await expect(
      db.pool.query(
        "INSERT INTO bookings (id, resource_id, period) VALUES ('A', 'R1', '[10,10)')",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.pool.query(
        "INSERT INTO bookings (id, resource_id, period) VALUES ('A', 'R9', '[10,20)')",
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('maps a foreign key violation to resource_not_found', async () => {
    const repository = new PostgresBookingsRepository(db.pool);

    expect(
      await repository.insert({ id: 'A', resourceId: 'R9', start: 0, end: 1 }),
    ).toEqual({
      ok: false,
      error: { code: 'resource_not_found', resourceId: 'R9' },
    });
  });

  it('serves conflict lookups from the exclusion constraint GiST index', async () => {
    await db.pool.query('SET enable_seqscan = off');
    try {
      const { rows } = await db.pool.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id FROM bookings
          WHERE resource_id = 'R1' AND status = 'active'
            AND period && int4range(0, 10, '[)')`,
      );
      expect(rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
        'bookings_no_overlap',
      );
    } finally {
      await db.pool.query('RESET enable_seqscan');
    }
  });
});
