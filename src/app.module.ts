import { Module } from '@nestjs/common';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { ResourcesModule } from './modules/resources/resources.module.js';
import { DatabaseModule } from './shared/database/database.module.js';

@Module({
  imports: [DatabaseModule, ResourcesModule, BookingsModule],
})
export class AppModule {}
