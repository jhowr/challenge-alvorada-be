import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../shared/result.js';
import { ResourcesService } from '../../resources/services/resources.service.js';
import type { Availability, AvailabilityError } from '../booking.types.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingsRepository,
} from '../repositories/bookings.repository.js';
import { parseAvailabilityQuery } from './booking-validator.js';

/** Read-only: answers whether a period is free without booking it (BR10). */
@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(BOOKINGS_REPOSITORY)
    private readonly bookings: BookingsRepository,
    private readonly resources: ResourcesService,
  ) {}

  async check(
    input: unknown,
  ): Promise<Result<Availability, AvailabilityError>> {
    const parsed = parseAvailabilityQuery(input);
    if (!parsed.ok) return parsed;
    const query = parsed.value;

    if (!(await this.resources.exists(query.resourceId))) {
      return err({ code: 'resource_not_found', resourceId: query.resourceId });
    }
    const conflicts = await this.bookings.findActiveConflicts(
      query.resourceId,
      query,
    );
    return ok({ ...query, available: conflicts.length === 0, conflicts });
  }
}
