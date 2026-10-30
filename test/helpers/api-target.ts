import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp } from './create-test-app.js';
import { startTestDatabase } from './postgres-container.js';

/** A running app the API suite can reset between tests. */
export interface ApiTarget {
  app(): INestApplication<App>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** In-memory driver: a fresh app per test is the reset. */
export async function memoryTarget(): Promise<ApiTarget> {
  let app = await createTestApp();
  return {
    app: () => app,
    reset: async () => {
      await app.close();
      app = await createTestApp();
    },
    close: () => app.close(),
  };
}

/** Postgres driver: one app over a throwaway container, truncated per test. */
export async function postgresTarget(): Promise<ApiTarget> {
  const db = await startTestDatabase();
  const previous = { ...process.env };
  process.env.DB_DRIVER = 'postgres';
  process.env.DATABASE_URL = db.connectionUri;
  const app = await createTestApp();
  return {
    app: () => app,
    reset: () => db.reset(),
    close: async () => {
      await app.close();
      await db.stop();
      process.env = previous;
    },
  };
}
