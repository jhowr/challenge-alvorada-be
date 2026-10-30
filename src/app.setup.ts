import type { INestApplication } from '@nestjs/common';
import { HttpErrorFilter } from './shared/http/http-error.filter.js';

/** Shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  return app;
}
