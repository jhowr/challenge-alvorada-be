import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { Booking, CancelOutcome } from '../booking.types.js';
import { BookingsService } from '../services/bookings.service.js';
import { unwrap } from './http-errors.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(@Body() body: unknown): Promise<Booking> {
    return unwrap(await this.bookingsService.create(body));
  }

  @Get()
  async list(@Query() query: Record<string, unknown>): Promise<Booking[]> {
    return unwrap(await this.bookingsService.list(query));
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Booking> {
    return unwrap(await this.bookingsService.findById(id));
  }

  // A sub-resource instead of DELETE: the booking keeps existing as cancelled.
  @Post(':id/cancellation')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
  ): Promise<{ outcome: CancelOutcome; booking: Booking }> {
    return unwrap(await this.bookingsService.cancel(id));
  }
}
