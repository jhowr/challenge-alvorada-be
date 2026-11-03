import {
  Controller,
  Get,
  Param,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import type { Availability } from '../booking.types';
import {
  AvailabilityParamsRequest,
  AvailabilityQueryRequest,
  AvailabilityResponse,
} from '../dto/availability.dto';
import { AvailabilityService } from '../services/availability.service';

// Lives in the bookings feature: availability is a question about bookings.
@Controller('resources/:resourceId/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @SerializeOptions({ type: AvailabilityResponse })
  check(
    @Param() { resourceId }: AvailabilityParamsRequest,
    @Query() { start, end }: AvailabilityQueryRequest,
  ): Promise<Availability> {
    return this.availabilityService.check({ resourceId, start, end });
  }
}
