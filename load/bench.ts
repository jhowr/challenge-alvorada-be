/**
 * Throughput and latency benchmark with autocannon against one instance of
 * the compiled app. The database in DATABASE_URL is migrated and its
 * bookings are replaced by SEED bookings (default 100k), so queries run
 * against a realistic table, not an empty one.
 *
 * Both the load generator and the server run on this machine, so absolute
 * numbers are a lower bound; compare scenarios with each other.
 */
import autocannon, { type Result } from 'autocannon';
import { DataSource } from 'typeorm';
import { databaseOptions, runMigrations } from '../src/config/database.config';
import { loadConfig } from '../src/config/env.config';
import { startServers } from './servers';

const seed = Number(process.env.SEED ?? 100_000);
const duration = Number(process.env.DURATION ?? 10);
const connections = Number(process.env.CONNECTIONS ?? 50);
const run = Date.now().toString(36);

async function seedDatabase(): Promise<void> {
  const db = await new DataSource(
    databaseOptions(loadConfig().DATABASE_URL),
  ).initialize();
  try {
    await runMigrations(db);
    await db.query('TRUNCATE bookings');
    // Back-to-back bookings over five resources, one in ten cancelled.
    await db.query(
      `INSERT INTO bookings (id, resource_id, period, status, cancelled_at)
       SELECT 'seed-' || g,
              (ARRAY['PROJECTOR-1','R1','R2','ROOM-A','ROOM-B'])[g % 5 + 1],
              int4range(1000000 + (g / 5) * 10, 1000000 + (g / 5) * 10 + 10),
              CASE WHEN g % 10 = 0 THEN 'cancelled' ELSE 'active' END,
              CASE WHEN g % 10 = 0 THEN now() END
         FROM generate_series(0, $1 - 1) AS g`,
      [seed],
    );
    await db.query('ANALYZE bookings');
  } finally {
    await db.destroy();
  }
}

interface Scenario {
  name: string;
  path: string;
  /** Builds the body of each request; omitted for GET scenarios. */
  body?: () => unknown;
}

let counter = 0;
const RESOURCES = ['PROJECTOR-1', 'R1', 'R2', 'ROOM-A', 'ROOM-B'];

const scenarios: Scenario[] = [
  {
    name: 'GET availability (free period)',
    path: '/resources/ROOM-A/availability?start=0&end=100',
  },
  {
    name: 'GET availability (50 conflicts)',
    path: '/resources/ROOM-A/availability?start=1000000&end=1002500',
  },
  {
    name: 'GET booking by id',
    path: '/bookings/seed-4242',
  },
  {
    name: 'POST bookings, no contention',
    path: '/bookings',
    body: () => {
      const n = counter++;
      return {
        id: `bench-${run}-${n}`,
        resourceId: RESOURCES[n % RESOURCES.length],
        start: -2_000_000_000 + n * 10,
        end: -2_000_000_000 + n * 10 + 5,
      };
    },
  },
  {
    name: 'POST bookings, one hot slot (409s)',
    path: '/bookings',
    body: () => ({
      id: `hot-${run}-${counter++}`,
      resourceId: 'ROOM-A',
      start: 500,
      end: 600,
    }),
  },
];

function optionsFor(scenario: Scenario, baseUrl: string): autocannon.Options {
  const url = baseUrl + scenario.path;
  const { body } = scenario;
  if (!body) return { url, duration, connections };
  return {
    url,
    duration,
    connections,
    requests: [
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        setupRequest: (request) => ({
          ...request,
          body: JSON.stringify(body()),
        }),
      },
    ],
  };
}

function summarize(name: string, result: Result) {
  return {
    scenario: name,
    'req/s': Math.round(result.requests.average),
    'p50 ms': result.latency.p50,
    'p99 ms': result.latency.p99,
    'max ms': result.latency.max,
    '2xx': result['2xx'],
    non2xx: result.non2xx,
    errors: result.errors + result.timeouts,
  };
}

console.log(`Seeding ${seed} bookings...`);
await seedDatabase();
const servers = await startServers(1);
const rows = [];
try {
  for (const scenario of scenarios) {
    const result = await autocannon(optionsFor(scenario, servers.urls[0]!));
    rows.push(summarize(scenario.name, result));
  }
} finally {
  await servers.stop();
}
console.log(
  `\n${connections} connections, ${duration}s per scenario, ${seed} seeded bookings`,
);
console.table(rows);
