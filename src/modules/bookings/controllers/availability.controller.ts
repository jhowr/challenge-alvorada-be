import { Controller, Get, Param, Query } from '@nestjs/common';
import { coerceNumeric } from '../../../shared/http/query.js';
import type { Availability } from '../booking.types.js';
import { AvailabilityService } from '../services/availability.service.js';
import { unwrap } from './http-errors.js';

// Lives in the bookings feature: availability is a question about bookings.
@Controller('resources/:resourceId/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async check(
    @Param('resourceId') resourceId: string,
    @Query('start') start: unknown,
    @Query('end') end: unknown,
  ): Promise<Availability> {
    return unwrap(
      await this.availabilityService.check({
        resourceId,
        start: coerceNumeric(start),
        end: coerceNumeric(end),
      }),
    );
  }
}
