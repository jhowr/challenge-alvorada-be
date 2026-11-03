import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import type { Booking, CancelOutcome } from '../booking.types';
import {
  BookingParamsRequest,
  BookingResponse,
  CancelBookingResponse,
  CreateBookingRequest,
  ListBookingsRequest,
} from '../dto/bookings.dto';
import { BookingsService } from '../services/bookings.service';

@Controller('bookings')
@SerializeOptions({ type: BookingResponse })
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@Body() body: CreateBookingRequest): Promise<Booking> {
    return this.bookingsService.create(body);
  }

  @Get()
  list(@Query() query: ListBookingsRequest): Promise<Booking[]> {
    return this.bookingsService.list(query);
  }

  @Get(':id')
  findById(@Param() { id }: BookingParamsRequest): Promise<Booking> {
    return this.bookingsService.findById(id);
  }

  // A sub-resource instead of DELETE: the booking keeps existing as cancelled.
  @Post(':id/cancellation')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ type: CancelBookingResponse })
  cancel(
    @Param() { id }: BookingParamsRequest,
  ): Promise<{ outcome: CancelOutcome; booking: Booking }> {
    return this.bookingsService.cancel(id);
  }
}
