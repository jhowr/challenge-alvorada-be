import request from 'supertest';
import { startTestApp, type TestApp } from '../helpers/test-app';

describe('Resources (e2e)', () => {
  let testApp: TestApp;
  const http = () => request(testApp.app.getHttpServer());

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('GET /resources lists the fixed resources in ascending id order', async () => {
    await http()
      .get('/resources')
      .expect(200)
      .expect(['PROJECTOR-1', 'R1', 'R2', 'ROOM-A', 'ROOM-B']);
  });

  it('resource ids are case-sensitive', async () => {
    const response = await http()
      .get('/resources/r1/availability?start=0&end=1')
      .expect(404);
    expect(response.body).toMatchObject({ code: 'resource_not_found' });
  });

  it('unknown routes answer with the standard error shape', async () => {
    const response = await http().get('/nope').expect(404);
    expect(response.body).toMatchObject({ code: 'route_not_found' });
  });
});
