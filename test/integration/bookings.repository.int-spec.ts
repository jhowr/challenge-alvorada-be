import { QueryFailedError } from 'typeorm';
import { BookingEntity } from '../../src/modules/bookings/entities/booking.entity';
import { BookingsRepository } from '../../src/modules/bookings/repositories/bookings.repository';
import { BookingsService } from '../../src/modules/bookings/services/bookings.service';
import { ResourceEntity } from '../../src/modules/resources/entities/resource.entity';
import { ResourcesRepository } from '../../src/modules/resources/repositories/resources.repository';
import { ResourcesService } from '../../src/modules/resources/services/resources.service';
import { withInsertBarrier } from '../helpers/insert-barrier.repository';
import {
  startTestDatabase,
  type TestDatabase,
} from '../helpers/postgres-container';

let db: TestDatabase;
const bookingsRepository = () =>
  new BookingsRepository(db.dataSource.getRepository(BookingEntity));

beforeAll(async () => {
  db = await startTestDatabase();
});

afterAll(async () => {
  await db?.stop();
});

describe('BookingsRepository', () => {
  let repository: BookingsRepository;
  const insert = (id: string, resourceId: string, start: number, end: number) =>
    repository.insert({ id, resourceId, start, end });

  beforeEach(async () => {
    await db.reset();
    repository = bookingsRepository();
  });

  it('stores and returns an active booking', async () => {
    expect(await insert('A', 'R1', 10, 20)).toEqual({
      id: 'A',
      resourceId: 'R1',
      start: 10,
      end: 20,
      status: 'active',
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

    await expect(insert('B', 'R1', 20, 30)).resolves.toBeDefined();
    await expect(insert('C', 'R1', 0, 10)).resolves.toBeDefined();
    await expect(insert('D', 'R1', 19, 21)).rejects.toMatchObject({
      code: 'conflict',
      conflictingIds: ['A', 'B'],
    });
    expect(await repository.findById('D')).toBeNull();
  });

  it('BR4 — overlap only matters within the same resource', async () => {
    await insert('A', 'R1', 10, 20);

    await expect(insert('B', 'R2', 10, 20)).resolves.toBeDefined();
  });

  it('BR6 — rejects a used id, even when the booking is cancelled', async () => {
    await insert('A', 'R1', 10, 20);
    await repository.cancelIfActive('A');

    await expect(insert('A', 'R2', 50, 60)).rejects.toMatchObject({
      code: 'id_already_used',
      id: 'A',
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
    await expect(insert('B', 'R1', 10, 20)).resolves.toBeDefined();
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
    await expect(insert('B', 'R1', max - 1, max)).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});

describe('Postgres — guarantees beyond the application', () => {
  beforeEach(async () => {
    await db.reset();
  });

  const REQUESTS = 10;
  const racingService = () =>
    new BookingsService(
      withInsertBarrier(bookingsRepository(), REQUESTS),
      new ResourcesService(
        new ResourcesRepository(db.dataSource.getRepository(ResourceEntity)),
      ),
    );

  it('accepts exactly one of many concurrent overlapping bookings', async () => {
    const service = racingService();

    // The barrier lets every request pass the service's pre-checks before any
    // insert lands, so only the locked insert (and, behind it, the exclusion
    // constraint) prevents double booking.
    const results = await Promise.allSettled(
      Array.from({ length: REQUESTS }, (_, i) =>
        service.create({
          id: `req-${i}`,
          resourceId: 'ROOM-A',
          start: 100 + i,
          end: 200,
        }),
      ),
    );

    const accepted = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const rejected = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(REQUESTS - 1);
    for (const error of rejected) {
      expect(error).toMatchObject({
        code: 'conflict',
        conflictingIds: [accepted[0]!.id],
      });
    }
    const rows = await db.dataSource.query(
      "SELECT count(*)::int AS active FROM bookings WHERE status = 'active'",
    );
    expect(rows[0].active).toBe(1);
  });

  it('accepts exactly one of many concurrent bookings with the same id', async () => {
    const service = racingService();

    const results = await Promise.allSettled(
      Array.from({ length: REQUESTS }, (_, i) =>
        service.create({
          id: 'same',
          resourceId: 'ROOM-A',
          start: i * 10,
          end: i * 10 + 5,
        }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ code: 'id_already_used' });
      }
    }
  });

  it('rejects an overlapping INSERT that bypasses the application', async () => {
    await db.dataSource.query(
      "INSERT INTO bookings (id, resource_id, period) VALUES ('A', 'R1', '[10,20)')",
    );

    const attempt = db.dataSource.query(
      "INSERT INTO bookings (id, resource_id, period) VALUES ('B', 'R1', '[19,21)')",
    );

    await expect(attempt).rejects.toBeInstanceOf(QueryFailedError);
    await expect(attempt).rejects.toMatchObject({
      code: '23P01',
      constraint: 'bookings_no_overlap',
    });
  });

  it('queues inserts on the same resource behind its row lock', async () => {
    // Without the per-resource lock every functional test still passes (the
    // constraint keeps the data right), but contention turns into deadlocks
    // and 500s. This pins the serialization deterministically.
    const repository = bookingsRepository();
    const holder = db.dataSource.createQueryRunner();
    await holder.connect();
    try {
      await holder.startTransaction();
      await holder.query(
        "SELECT 1 FROM resources WHERE id = 'ROOM-A' FOR NO KEY UPDATE",
      );

      let settled = false;
      const blocked = repository
        .insert({ id: 'A', resourceId: 'ROOM-A', start: 0, end: 10 })
        .finally(() => (settled = true));
      const otherResource = await repository.insert({
        id: 'B',
        resourceId: 'ROOM-B',
        start: 0,
        end: 10,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(otherResource.id).toBe('B');
      expect(settled).toBe(false);
      await holder.rollbackTransaction();
      expect((await blocked).id).toBe('A');
    } finally {
      await holder.release();
    }
  });

  it('rejects an empty period and an unknown resource at the schema level', async () => {
    await expect(
      db.dataSource.query(
        "INSERT INTO bookings (id, resource_id, period) VALUES ('A', 'R1', '[10,10)')",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.dataSource.query(
        "INSERT INTO bookings (id, resource_id, period) VALUES ('A', 'R9', '[10,20)')",
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('returns resource_not_found for an unknown resource', async () => {
    const repository = bookingsRepository();

    await expect(
      repository.insert({ id: 'A', resourceId: 'R9', start: 0, end: 1 }),
    ).rejects.toMatchObject({ code: 'resource_not_found', resourceId: 'R9' });
  });

  it('serves conflict lookups from the exclusion constraint GiST index', async () => {
    // SET is per connection, so the EXPLAIN must run on the same one.
    const session = db.dataSource.createQueryRunner();
    await session.connect();
    try {
      await session.query('SET enable_seqscan = off');
      const rows: { 'QUERY PLAN': string }[] = await session.query(
        `EXPLAIN SELECT id FROM bookings
          WHERE resource_id = 'R1' AND status = 'active'
            AND period && int4range(0, 10, '[)')`,
      );
      expect(rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
        'bookings_no_overlap',
      );
    } finally {
      await session.query('RESET enable_seqscan');
      await session.release();
    }
  });

  it('keeps the entities in sync with the migrated schema', async () => {
    // What `migration:generate` would emit. A mismatch would make it propose
    // dropping or rewriting constraints, such as bookings_no_overlap.
    const pending = await db.dataSource.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });
});
