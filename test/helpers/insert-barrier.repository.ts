import type { BookingsRepository } from '../../src/modules/bookings/repositories/bookings.repository';

/**
 * Wraps a repository so that no insert reaches the database until `parties`
 * callers are waiting to insert. This forces the worst-case interleaving:
 * every request passes the service's pre-checks against the same empty state
 * before any of them writes.
 */
export function withInsertBarrier(
  repository: BookingsRepository,
  parties: number,
): BookingsRepository {
  let waiting = 0;
  let release!: () => void;
  const allArrived = new Promise<void>((resolve) => (release = resolve));

  // Every other method is the real repository's.
  const wrapped = Object.create(repository) as BookingsRepository;
  wrapped.insert = async (booking) => {
    waiting += 1;
    if (waiting === parties) release();
    await allArrived;
    return repository.insert(booking);
  };
  return wrapped;
}
