import { InMemoryBookingsRepository } from '../../src/modules/bookings/repositories/in-memory-bookings.repository.js';
import { bookingsRepositoryContract } from './bookings-repository.contract.js';

bookingsRepositoryContract('InMemory', () =>
  Promise.resolve(new InMemoryBookingsRepository()),
);
