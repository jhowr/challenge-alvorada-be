import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../helpers/create-test-app.js';

describe('Bookings (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());
  const create = (id: string, resourceId: string, start: number, end: number) =>
    http().post('/bookings').send({ id, resourceId, start, end });

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /bookings', () => {
    it('201 with the created booking', async () => {
      await create('A', 'R1', 10, 20)
        .expect(201)
        .expect({
          id: 'A',
          resourceId: 'R1',
          start: 10,
          end: 20,
          status: 'active',
        });
    });

    it('400 validation_error listing every invalid field', async () => {
      const response = await http()
        .post('/bookings')
        .send({ id: '', resourceId: 'R1', start: 20, end: 10 })
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'validation_error',
        message: 'Invalid input',
        details: [
          { field: 'id', reason: 'must not be empty' },
          { field: 'end', reason: 'must be greater than start' },
        ],
      });
    });

    it('400 validation_error for a malformed JSON body', async () => {
      const response = await http()
        .post('/bookings')
        .set('Content-Type', 'application/json')
        .send('{"id": "A",')
        .expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });

    it('404 resource_not_found', async () => {
      const response = await create('A', 'R9', 10, 20).expect(404);
      expect(response.body).toEqual({
        code: 'resource_not_found',
        resourceId: 'R9',
        message: 'Resource "R9" does not exist',
      });
    });

    it('409 conflict naming the conflicting bookings', async () => {
      await create('A', 'R1', 10, 20).expect(201);
      await create('B', 'R1', 20, 30).expect(201);

      const response = await create('C', 'R1', 19, 21).expect(409);
      expect(response.body).toMatchObject({
        code: 'conflict',
        conflictingIds: ['A', 'B'],
      });
    });

    it('409 id_already_used after cancellation', async () => {
      await create('A', 'R1', 10, 20).expect(201);
      await http().post('/bookings/A/cancellation').expect(200);

      const response = await create('A', 'R2', 10, 20).expect(409);
      expect(response.body).toMatchObject({ code: 'id_already_used', id: 'A' });
    });
  });

  describe('POST /bookings/:id/cancellation', () => {
    it('200 cancelled, then 200 already_cancelled', async () => {
      await create('A', 'R1', 10, 20).expect(201);

      await http()
        .post('/bookings/A/cancellation')
        .expect(200)
        .expect({
          outcome: 'cancelled',
          booking: {
            id: 'A',
            resourceId: 'R1',
            start: 10,
            end: 20,
            status: 'cancelled',
          },
        });
      const again = await http().post('/bookings/A/cancellation').expect(200);
      expect(again.body.outcome).toBe('already_cancelled');
    });

    it('404 booking_not_found', async () => {
      const response = await http()
        .post('/bookings/nope/cancellation')
        .expect(404);
      expect(response.body).toMatchObject({
        code: 'booking_not_found',
        id: 'nope',
      });
    });
  });

  describe('GET /bookings', () => {
    it('lists with filters', async () => {
      await create('B', 'R1', 0, 10).expect(201);
      await create('A', 'R2', 0, 10).expect(201);
      await http().post('/bookings/B/cancellation').expect(200);

      const all = await http().get('/bookings').expect(200);
      expect(all.body.map((b: { id: string }) => b.id)).toEqual(['A', 'B']);

      const cancelled = await http()
        .get('/bookings?status=cancelled')
        .expect(200);
      expect(cancelled.body).toEqual([
        { id: 'B', resourceId: 'R1', start: 0, end: 10, status: 'cancelled' },
      ]);

      const byResource = await http()
        .get('/bookings?resourceId=R2')
        .expect(200);
      expect(byResource.body.map((b: { id: string }) => b.id)).toEqual(['A']);
    });

    it('400 for an unknown status filter', async () => {
      const response = await http().get('/bookings?status=deleted').expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });
  });

  describe('GET /bookings/:id', () => {
    it('200 with the booking, 404 when missing', async () => {
      await create('A', 'R1', 10, 20).expect(201);

      await http().get('/bookings/A').expect(200);
      const missing = await http().get('/bookings/Z').expect(404);
      expect(missing.body).toMatchObject({ code: 'booking_not_found' });
    });
  });

  describe('GET /resources/:resourceId/availability', () => {
    it('reports conflicts in ascending id order without booking', async () => {
      await create('B', 'R1', 20, 30).expect(201);
      await create('A', 'R1', 10, 20).expect(201);

      await http()
        .get('/resources/R1/availability?start=19&end=21')
        .expect(200)
        .expect({
          resourceId: 'R1',
          start: 19,
          end: 21,
          available: false,
          conflicts: [
            { id: 'A', resourceId: 'R1', start: 10, end: 20, status: 'active' },
            { id: 'B', resourceId: 'R1', start: 20, end: 30, status: 'active' },
          ],
        });
      const list = await http().get('/bookings').expect(200);
      expect(list.body).toHaveLength(2);
    });

    it('is available for an adjacent period', async () => {
      await create('A', 'R1', 10, 20).expect(201);

      const response = await http()
        .get('/resources/R1/availability?start=20&end=30')
        .expect(200);
      expect(response.body).toMatchObject({ available: true, conflicts: [] });
    });

    it.each([
      ['start=&end=10', 'an empty start'],
      ['start=abc&end=10', 'a non-numeric start'],
      ['start=10', 'a missing end'],
      ['start=10.5&end=20', 'a decimal start'],
      ['start=10&end=10', 'an empty period'],
    ])('400 for ?%s (%s)', async (query) => {
      const response = await http()
        .get(`/resources/R1/availability?${query}`)
        .expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });

    it('404 for an unknown resource', async () => {
      const response = await http()
        .get('/resources/R9/availability?start=0&end=10')
        .expect(404);
      expect(response.body).toMatchObject({ code: 'resource_not_found' });
    });
  });
});
