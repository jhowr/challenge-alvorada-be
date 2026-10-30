import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../shared/database/database.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { AvailabilityController } from './controllers/availability.controller.js';
import { BookingsController } from './controllers/bookings.controller.js';
import { BOOKINGS_REPOSITORY } from './repositories/bookings.repository.js';
import { InMemoryBookingsRepository } from './repositories/in-memory-bookings.repository.js';
import { PostgresBookingsRepository } from './repositories/postgres-bookings.repository.js';
import { AvailabilityService } from './services/availability.service.js';
import { BookingsService } from './services/bookings.service.js';

@Module({
  imports: [ResourcesModule],
  controllers: [BookingsController, AvailabilityController],
  providers: [
    BookingsService,
    AvailabilityService,
    {
      provide: BOOKINGS_REPOSITORY,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool
          ? new PostgresBookingsRepository(pool)
          : new InMemoryBookingsRepository(),
    },
  ],
})
export class BookingsModule {}
