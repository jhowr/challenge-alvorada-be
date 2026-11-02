import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ResourcesModule } from './modules/resources/resources.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { HttpErrorFilter } from './shared/http/http-error.filter.js';

@Module({
  imports: [DatabaseModule, ResourcesModule, BookingsModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: HttpErrorFilter }],
})
export class AppModule {}
