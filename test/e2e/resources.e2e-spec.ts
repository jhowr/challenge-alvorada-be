import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../helpers/create-test-app.js';

describe('Resources (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /resources lists the fixed resources in ascending id order', async () => {
    await request(app.getHttpServer())
      .get('/resources')
      .expect(200)
      .expect(['PROJECTOR-1', 'R1', 'R2', 'ROOM-A', 'ROOM-B']);
  });

  it('unknown routes answer with the standard error shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/nope')
      .expect(404);
    expect(response.body).toMatchObject({ code: 'route_not_found' });
  });
});
