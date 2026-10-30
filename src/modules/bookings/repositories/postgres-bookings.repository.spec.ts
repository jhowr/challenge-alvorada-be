import { DatabaseError, type Pool } from 'pg';
import { PostgresBookingsRepository } from './postgres-bookings.repository.js';

const booking = { id: 'A', resourceId: 'R1', start: 10, end: 20 };

function deadlock(): DatabaseError {
  const error = new DatabaseError('deadlock detected', 0, 'error');
  error.code = '40P01';
  return error;
}

function poolFailing(times: number) {
  const query = vi.fn();
  for (let i = 0; i < times; i++) query.mockRejectedValueOnce(deadlock());
  query.mockResolvedValue({ rows: [{ ...booking, status: 'active' }] });
  return { pool: { query } as unknown as Pool, query };
}

// The real race is exercised in test/integration; these pin the retry policy
// deterministically, since a deadlock only happens under specific timing.
describe('PostgresBookingsRepository.insert — deadlock retry', () => {
  it('retries an insert aborted by a deadlock', async () => {
    const { pool, query } = poolFailing(2);

    const result = await new PostgresBookingsRepository(pool).insert(booking);

    expect(result.ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('gives up after 5 attempts and rethrows', async () => {
    const { pool, query } = poolFailing(5);

    await expect(
      new PostgresBookingsRepository(pool).insert(booking),
    ).rejects.toMatchObject({ code: '40P01' });
    expect(query).toHaveBeenCalledTimes(5);
  });
});
