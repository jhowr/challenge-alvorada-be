import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesModule } from '../resources/resources.module';
import { AvailabilityController } from './controllers/availability.controller';
import { BookingsController } from './controllers/bookings.controller';
import { BookingEntity } from './entities/booking.entity';
import { BookingsRepository } from './repositories/bookings.repository';
import { AvailabilityService } from './services/availability.service';
import { BookingsService } from './services/bookings.service';

@Module({
  imports: [TypeOrmModule.forFeature([BookingEntity]), ResourcesModule],
  controllers: [BookingsController, AvailabilityController],
  providers: [BookingsService, AvailabilityService, BookingsRepository],
})
export class BookingsModule {}
