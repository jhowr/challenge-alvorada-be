import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { startTestDatabase } from './postgres-container';

/** The real app over a throwaway Postgres, which tests can reset. */
export async function startTestApp() {
  const db = await startTestDatabase();
  process.env.DATABASE_URL = db.connectionUri;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return {
    app,
    /** Deletes every booking, keeping the resources. */
    reset: () => db.reset(),
    close: async () => {
      await app.close();
      await db.stop();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;
