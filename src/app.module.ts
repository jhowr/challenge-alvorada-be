import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { databaseModule } from './config/database.config';
import { BookingsModule } from './modules/bookings/bookings.module';
import { HealthModule } from './modules/health/health.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { HttpErrorFilter } from './shared/http/http-error.filter';
import { RequestValidationPipe } from './shared/validation/validation.pipe';

@Module({
  imports: [databaseModule(), ResourcesModule, BookingsModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    { provide: APP_PIPE, useClass: RequestValidationPipe },
    {
      // Responses are built from the type named by @SerializeOptions, with
      // only its @Expose()d properties: nothing else reaches the client.
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) =>
        new ClassSerializerInterceptor(reflector, {
          excludeExtraneousValues: true,
        }),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
