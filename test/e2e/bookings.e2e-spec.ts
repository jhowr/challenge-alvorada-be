import request from 'supertest';
import { startTestApp, type TestApp } from '../helpers/test-app';
import { minute } from '../helpers/minutes';

/** HTTP behaviour of the bookings API, against a real Postgres. */
describe('Bookings API (e2e)', () => {
  let testApp: TestApp;
  const http = () => request(testApp.app.getHttpServer());
  const create = (id: string, resourceId: string, start: number, end: number) =>
    http().post('/bookings').send({ id, resourceId, start, end });

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  beforeEach(async () => {
    await testApp.reset();
  });

  describe('POST /bookings', () => {
    it('201 with the created booking', async () => {
      await create('A', 'R1', 10, 20).expect(201).expect({
        id: 'A',
        resourceId: 'R1',
        start: 10,
        end: 20,
        status: 'active',
      });
    });

    it('accepts the example from the challenge statement', async () => {
      await create('A', 'R1', 10, 20).expect(201);
      await create('B', 'R1', 20, 30).expect(201);
      const conflict = await create('C', 'R1', 19, 21).expect(409);
      expect(conflict.body.conflictingIds).toEqual(['A', 'B']);
      await create('C', 'R2', 19, 21).expect(201);

      const before = await http()
        .get('/resources/R1/availability?start=19&end=21')
        .expect(200);
      expect(before.body.conflicts.map((b: { id: string }) => b.id)).toEqual([
        'A',
        'B',
      ]);
      await http().post('/bookings/A/cancellation').expect(200);
      const after = await http()
        .get('/resources/R1/availability?start=10&end=20')
        .expect(200);
      expect(after.body.available).toBe(true);
      await create('A', 'R1', 0, 5).expect(409);
    });

    it('400 for an unknown field such as status', async () => {
      const response = await http()
        .post('/bookings')
        .send({
          id: 'A',
          resourceId: 'R1',
          start: 1,
          end: 2,
          status: 'cancelled',
        })
        .expect(400);
      expect(response.body.details).toEqual([
        { field: 'status', reason: 'is not allowed' },
      ]);
    });

    it('400 for an unknown field named like an Object method', async () => {
      const response = await http()
        .post('/bookings')
        .send({ id: 'A', resourceId: 'R1', start: 1, end: 2, toString: 'x' })
        .expect(400);
      expect(response.body.details).toEqual([
        { field: 'toString', reason: 'is not allowed' },
      ]);
    });

    it('400 for a JSON body that is not an object', async () => {
      await http()
        .post('/bookings')
        .send([])
        .expect(400)
        .expect({
          code: 'validation_error',
          message: 'Invalid input',
          details: [{ field: '(input)', reason: 'must be a JSON object' }],
        });
    });

    it.each([
      ['a conflict', { resourceId: 'R1', start: 15, end: 25 }],
      ['an unknown resource', { resourceId: 'R9', start: 0, end: 5 }],
      ['invalid data', { resourceId: 'R1', start: 5, end: 5 }],
    ])(
      'BR5 — an attempt rejected by %s does not take the id',
      async (_label, attempt) => {
        await create('A', 'R1', 10, 20).expect(201);

        const rejected = await create(
          'X',
          attempt.resourceId,
          attempt.start,
          attempt.end,
        );
        expect(rejected.status).toBeGreaterThanOrEqual(400);
        await http().get('/bookings/X').expect(404);
        await create('X', 'R2', 0, 5).expect(201);
      },
    );

    it('400 validation_error listing every invalid field', async () => {
      await http()
        .post('/bookings')
        .send({ id: '', resourceId: 'R1', start: 20, end: 10 })
        .expect(400)
        .expect({
          code: 'validation_error',
          message: 'Invalid input',
          details: [
            { field: 'id', reason: 'must not be empty' },
            { field: 'end', reason: 'must be greater than start' },
          ],
        });
    });

    it('400 validation_error with details for a malformed JSON body', async () => {
      const response = await http()
        .post('/bookings')
        .set('Content-Type', 'application/json')
        .send('{"id": "A",')
        .expect(400);
      expect(response.body).toEqual({
        code: 'validation_error',
        message: 'Invalid input',
        details: [{ field: '(input)', reason: expect.any(String) }],
      });
    });

    it('413 payload_too_large for a huge body', async () => {
      const response = await http()
        .post('/bookings')
        .send({
          id: 'A',
          resourceId: 'R1',
          start: 1,
          end: 2,
          pad: 'x'.repeat(200_000),
        })
        .expect(413);
      expect(response.body).toMatchObject({ code: 'payload_too_large' });
    });

    it.each([
      ['a NUL in the resource', { resourceId: 'R1\u0000' }, 'resourceId'],
      ['a NUL in the id', { id: 'A\u0000' }, 'id'],
      ['a lone surrogate in the id', { id: '\ud800' }, 'id'],
    ])(
      '400 for %s (never reaches storage)',
      async (_label, override, field) => {
        const response = await http()
          .post('/bookings')
          .send({ id: 'A', resourceId: 'R1', start: 1, end: 2, ...override })
          .expect(400);
        expect(response.body.details).toEqual([
          { field, reason: expect.any(String) },
        ]);
      },
    );

    it('404 resource_not_found', async () => {
      await create('A', 'R9', 10, 20).expect(404).expect({
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
      expect(response.body).toMatchObject({
        code: 'id_already_used',
        id: 'A',
      });
    });

    it('accepts ids with URL-special characters and reads them back', async () => {
      for (const id of ['a/b', 'cancellation', 'sala 1', '😀', 'é']) {
        await create(id, 'R1', 0, 1).expect(201);
        await http()
          .get(`/bookings/${encodeURIComponent(id)}`)
          .expect(200);
        await http()
          .post('/bookings')
          .send({ id, resourceId: 'R2', start: 0, end: 1 })
          .expect(409);
        await http()
          .post(`/bookings/${encodeURIComponent(id)}/cancellation`)
          .expect(200);
      }
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

    it('exactly one of many concurrent cancellations wins', async () => {
      await create('A', 'R1', 10, 20).expect(201);

      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          http().post('/bookings/A/cancellation'),
        ),
      );

      const outcomes = responses.map((response) => response.body.outcome);
      expect(
        outcomes.filter((outcome) => outcome === 'cancelled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome === 'already_cancelled'),
      ).toHaveLength(19);
    });

    it('404 booking_not_found for an unknown id', async () => {
      const response = await http()
        .post('/bookings/nope/cancellation')
        .expect(404);
      expect(response.body).toMatchObject({ code: 'booking_not_found' });
    });

    it('400 for an id with a control character', async () => {
      const response = await http()
        .post('/bookings/A%00/cancellation')
        .expect(400);
      expect(response.body.details).toEqual([
        { field: 'id', reason: 'must not contain control characters' },
      ]);
    });
  });

  describe('GET /bookings', () => {
    it('lists with filters', async () => {
      await create('B', 'R1', 0, 10).expect(201);
      await create('A', 'R2', 0, 10).expect(201);
      await http().post('/bookings/B/cancellation').expect(200);

      const all = await http().get('/bookings').expect(200);
      expect(all.body.map((b: { id: string }) => b.id)).toEqual(['A', 'B']);

      await http()
        .get('/bookings?status=cancelled')
        .expect(200)
        .expect([
          {
            id: 'B',
            resourceId: 'R1',
            start: 0,
            end: 10,
            status: 'cancelled',
          },
        ]);

      const byResource = await http()
        .get('/bookings?resourceId=R2')
        .expect(200);
      expect(byResource.body.map((b: { id: string }) => b.id)).toEqual(['A']);
    });

    it.each([
      'status=deleted',
      'status=active&status=cancelled',
      'status[]=active',
      'status[a]=b',
      'unknown=1',
      'toString=x',
      'resourceId=R1%00',
    ])('400 for ?%s instead of silently ignoring it', async (query) => {
      const response = await http().get(`/bookings?${query}`).expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });
  });

  describe('GET /bookings/:id', () => {
    it('200 with the booking, 404 when missing, 400 when malformed', async () => {
      await create('A', 'R1', 10, 20).expect(201);

      await http().get('/bookings/A').expect(200);
      const missing = await http().get('/bookings/Z').expect(404);
      expect(missing.body).toMatchObject({ code: 'booking_not_found' });
      await http().get('/bookings/A%00').expect(400);
    });

    it('400 for a path that is not valid percent-encoded UTF-8', async () => {
      for (const id of ['%F0%9F', '%ED%A0%80']) {
        const response = await http().get(`/bookings/${id}`).expect(400);
        expect(response.body).toMatchObject({ code: 'validation_error' });
      }
    });
  });

  describe('GET /resources/:resourceId/availability', () => {
    it('reports active conflicts in ascending id order without booking', async () => {
      await create('B', 'R1', 20, 30).expect(201);
      await create('A', 'R1', 10, 20).expect(201);
      await create('C', 'R1', 15, 25).expect(409);
      await create('D', 'R2', 15, 25).expect(201);

      await http()
        .get('/resources/R1/availability?start=19&end=21')
        .expect(200)
        .expect({
          resourceId: 'R1',
          start: 19,
          end: 21,
          available: false,
          conflicts: [
            {
              id: 'A',
              resourceId: 'R1',
              start: 10,
              end: 20,
              status: 'active',
            },
            {
              id: 'B',
              resourceId: 'R1',
              start: 20,
              end: 30,
              status: 'active',
            },
          ],
        });
      const list = await http().get('/bookings').expect(200);
      expect(list.body).toHaveLength(3);
    });

    it('ignores cancelled bookings and adjacent periods', async () => {
      await create('A', 'R1', 10, 20).expect(201);
      await create('B', 'R1', 20, 30).expect(201);
      await http().post('/bookings/B/cancellation').expect(200);

      const response = await http()
        .get('/resources/R1/availability?start=20&end=30')
        .expect(200);
      expect(response.body).toMatchObject({ available: true, conflicts: [] });
    });

    it('handles the int32 boundaries', async () => {
      await create('A', 'R1', -(2 ** 31), 2 ** 31 - 1).expect(201);

      const response = await http()
        .get(
          `/resources/R1/availability?start=${2 ** 31 - 2}&end=${2 ** 31 - 1}`,
        )
        .expect(200);
      expect(response.body.conflicts.map((b: { id: string }) => b.id)).toEqual([
        'A',
      ]);
    });

    it.each([
      ['start=&end=10', 'an empty start'],
      ['start=abc&end=10', 'a non-numeric start'],
      ['start=1e3&end=2000', 'exponent notation'],
      ['start=10', 'a missing end'],
      ['start=10.5&end=20', 'a decimal start'],
      ['start=10&end=10', 'an empty period'],
      ['start=1&start=2&end=10', 'a repeated start'],
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

    it('400 for a resource with a control character', async () => {
      const response = await http()
        .get('/resources/R1%00/availability?start=0&end=10')
        .expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });
  });

  describe('minutes since epoch (the web panel convention)', () => {
    const at = (iso: string) => minute(`2026-11-${iso}Z`);
    const ids = (body: { id: string }[]) => body.map((b) => b.id);

    it('books across days without false conflicts', async () => {
      await create('standup', 'R1', at('02T09:00'), at('02T11:00')).expect(201);
      await create('review', 'R1', at('02T11:00'), at('02T12:00')).expect(201);
      await create('overnight', 'R1', at('02T22:00'), at('03T02:00')).expect(
        201,
      );
      await create('next-day', 'R1', at('03T09:00'), at('03T11:00')).expect(
        201,
      );

      const overlap = await create(
        'late',
        'R1',
        at('02T10:00'),
        at('02T12:00'),
      ).expect(409);
      expect(overlap.body).toMatchObject({
        code: 'conflict',
        conflictingIds: ['review', 'standup'],
      });
      const early = await create(
        'early',
        'R1',
        at('03T01:00'),
        at('03T03:00'),
      ).expect(409);
      expect(early.body.conflictingIds).toEqual(['overnight']);

      const day = await http()
        .get(
          `/resources/R1/availability?start=${at('02T00:00')}&end=${at('03T00:00')}`,
        )
        .expect(200);
      expect(ids(day.body.conflicts)).toEqual([
        'overnight',
        'review',
        'standup',
      ]);
    });

    it('books quarter hours back to back, and refuses one minute of overlap', async () => {
      await create('a', 'R2', at('02T09:00'), at('02T09:45')).expect(201);
      await create('b', 'R2', at('02T09:45'), at('02T10:30')).expect(201);

      const overlap = await create(
        'c',
        'R2',
        at('02T10:29'),
        at('02T11:00'),
      ).expect(409);
      expect(overlap.body.conflictingIds).toEqual(['b']);
      await create('d', 'R2', at('02T10:30'), at('02T10:37')).expect(201);
    });
  });

  it('GET /health answers ok while the database is reachable', async () => {
    await http().get('/health').expect(200).expect({ status: 'ok' });
  });
});
