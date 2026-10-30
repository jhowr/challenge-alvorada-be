/**
 * Reproducible walkthrough of the API, using a scenario different from the
 * challenge statement: a meeting room and a projector during a work day.
 * Times are plain integers read as HHMM for readability (900 = 9:00); the
 * API does not validate them as clock times.
 *
 * By default it starts the compiled app (dist/main.js) on a free port with
 * the current DB_DRIVER and stops it at the end. Set DEMO_URL to run against
 * a server that is already running instead; it must start with no bookings.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { isDeepStrictEqual } from 'node:util';

interface Step {
  title: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  expectedStatus: number;
  /** Picks the part of the response the step is about. */
  pick: (body: any) => unknown;
  expected: unknown;
}

const ids = (bookings: { id: string }[]) => bookings.map((b) => b.id);

const steps: Step[] = [
  {
    title: 'ROOM-A: book "daily" for [900, 915)',
    method: 'POST',
    path: '/bookings',
    body: { id: 'daily', resourceId: 'ROOM-A', start: 900, end: 915 },
    expectedStatus: 201,
    pick: (b) => b.status,
    expected: 'active',
  },
  {
    title: 'ROOM-A: book "retro" for [915, 1000), starting when daily ends',
    method: 'POST',
    path: '/bookings',
    body: { id: 'retro', resourceId: 'ROOM-A', start: 915, end: 1000 },
    expectedStatus: 201,
    pick: (b) => b.status,
    expected: 'active',
  },
  {
    title: 'ROOM-A: "planning" for [930, 1030) overlaps retro only',
    method: 'POST',
    path: '/bookings',
    body: { id: 'planning', resourceId: 'ROOM-A', start: 930, end: 1030 },
    expectedStatus: 409,
    pick: (b) => [b.code, b.conflictingIds],
    expected: ['conflict', ['retro']],
  },
  {
    title:
      'PROJECTOR-1: same "planning" id and period; the rejection kept the id free',
    method: 'POST',
    path: '/bookings',
    body: { id: 'planning', resourceId: 'PROJECTOR-1', start: 930, end: 1030 },
    expectedStatus: 201,
    pick: (b) => b.status,
    expected: 'active',
  },
  {
    title: 'ROOM-A availability for [850, 1000): both bookings, ascending id',
    method: 'GET',
    path: '/resources/ROOM-A/availability?start=850&end=1000',
    expectedStatus: 200,
    pick: (b) => [b.available, ids(b.conflicts)],
    expected: [false, ['daily', 'retro']],
  },
  {
    title: 'ROOM-A availability for [1000, 1100): free right when retro ends',
    method: 'GET',
    path: '/resources/ROOM-A/availability?start=1000&end=1100',
    expectedStatus: 200,
    pick: (b) => [b.available, ids(b.conflicts)],
    expected: [true, []],
  },
  {
    title: 'Cancel "retro"',
    method: 'POST',
    path: '/bookings/retro/cancellation',
    expectedStatus: 200,
    pick: (b) => [b.outcome, b.booking.status],
    expected: ['cancelled', 'cancelled'],
  },
  {
    title: 'Cancel "retro" again: nothing changes',
    method: 'POST',
    path: '/bookings/retro/cancellation',
    expectedStatus: 200,
    pick: (b) => b.outcome,
    expected: 'already_cancelled',
  },
  {
    title: 'ROOM-A: "planning-2" for [930, 1030) now fits',
    method: 'POST',
    path: '/bookings',
    body: { id: 'planning-2', resourceId: 'ROOM-A', start: 930, end: 1030 },
    expectedStatus: 201,
    pick: (b) => b.status,
    expected: 'active',
  },
  {
    title: 'Reuse the cancelled "retro" id elsewhere: ids are never reused',
    method: 'POST',
    path: '/bookings',
    body: { id: 'retro', resourceId: 'ROOM-B', start: 1400, end: 1500 },
    expectedStatus: 409,
    pick: (b) => b.code,
    expected: 'id_already_used',
  },
  {
    title: 'Book an unknown resource',
    method: 'POST',
    path: '/bookings',
    body: { id: 'coffee', resourceId: 'KITCHEN', start: 1000, end: 1015 },
    expectedStatus: 404,
    pick: (b) => b.code,
    expected: 'resource_not_found',
  },
  {
    title: 'Book an empty period [1200, 1200)',
    method: 'POST',
    path: '/bookings',
    body: { id: 'lunch', resourceId: 'ROOM-B', start: 1200, end: 1200 },
    expectedStatus: 400,
    pick: (b) => [b.code, b.details.map((d: { field: string }) => d.field)],
    expected: ['validation_error', ['end']],
  },
  {
    title: 'List cancelled bookings',
    method: 'GET',
    path: '/bookings?status=cancelled',
    expectedStatus: 200,
    pick: ids,
    expected: ['retro'],
  },
  {
    title: 'List all bookings with their status',
    method: 'GET',
    path: '/bookings',
    expectedStatus: 200,
    pick: (b: { id: string; status: string }[]) =>
      b.map((x) => `${x.id}:${x.status}`),
    expected: [
      'daily:active',
      'planning:active',
      'planning-2:active',
      'retro:cancelled',
    ],
  },
];

const color = (code: number, text: string) => `\x1b[${code}m${text}\x1b[0m`;
const show = (value: unknown) => JSON.stringify(value);

async function run(baseUrl: string): Promise<boolean> {
  let passed = 0;
  for (const [index, step] of steps.entries()) {
    const response = await fetch(baseUrl + step.path, {
      method: step.method,
      headers: step.body ? { 'content-type': 'application/json' } : {},
      body: step.body ? JSON.stringify(step.body) : undefined,
    });
    const body: unknown = await response.json();
    const actual = step.pick(body);
    const ok =
      response.status === step.expectedStatus &&
      isDeepStrictEqual(actual, step.expected);
    if (ok) passed += 1;

    console.log(`\n${index + 1}. ${step.title}`);
    console.log(
      color(
        90,
        `   ${step.method} ${step.path}${step.body ? ' ' + show(step.body) : ''}`,
      ),
    );
    console.log(`   expected: ${step.expectedStatus} ${show(step.expected)}`);
    console.log(
      `   actual:   ${response.status} ${show(actual)}  ${ok ? color(32, '✔') : color(31, '✘')}`,
    );
    if (!ok) console.log(color(31, `   full response: ${show(body)}`));
  }
  console.log(`\n${passed}/${steps.length} steps matched the expectation.`);
  return passed === steps.length;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function startServer(): Promise<{ url: string; child: ChildProcess }> {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error('dist/main.js exited; run `pnpm build` first');
    try {
      await fetch(`${url}/resources`);
      return { url, child };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error('Server did not start in time');
}

const external = process.env.DEMO_URL;
const server = external ? undefined : await startServer();
const baseUrl = external ?? server!.url;
console.log(
  `Running the demo against ${baseUrl} (DB_DRIVER=${process.env.DB_DRIVER ?? 'memory'})`,
);
try {
  process.exitCode = (await run(baseUrl)) ? 0 : 1;
} finally {
  server?.child.kill();
}
