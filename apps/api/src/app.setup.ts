import type { INestApplication } from '@nestjs/common';

/** Shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication): INestApplication {
  app.enableShutdownHooks();
  return app;
}
