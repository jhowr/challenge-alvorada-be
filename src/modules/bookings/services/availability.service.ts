import { Injectable } from '@nestjs/common';
import { ResourcesService } from '../../resources/services/resources.service';
import { ResourceNotFoundError } from '../booking.errors';
import type { Availability, AvailabilityQuery } from '../booking.types';
import { BookingsRepository } from '../repositories/bookings.repository';

/** Read-only: answers whether a period is free without booking it (BR10). */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly resources: ResourcesService,
  ) {}

  /**
   * Receives a validated query (the DTOs check BR11's period rules first).
   *
   * @throws ResourceNotFoundError
   */
  async check(query: AvailabilityQuery): Promise<Availability> {
    if (!(await this.resources.exists(query.resourceId))) {
      throw new ResourceNotFoundError(query.resourceId);
    }
    const conflicts = await this.bookings.findActiveConflicts(
      query.resourceId,
      query,
    );
    return { ...query, available: conflicts.length === 0, conflicts };
  }
}
