/**
 * Race-condition harness. Fires concurrent requests at one or more API
 * instances and then checks the invariants that must hold whatever the
 * interleaving:
 *   - no two active bookings of the same resource overlap;
 *   - every id answered with 201 exists, and ids are unique;
 *   - no request ever gets a 5xx;
 *   - lists and conflicts come in ascending (byte) id order.
 *
 * DB_DRIVER=memory (default) runs one instance. DB_DRIVER=postgres runs
 * INSTANCES (default 3) processes sharing the database, which is where the
 * service pre-checks cannot help and only the schema keeps the rules.
 */
import { loadConfig } from '../src/shared/config.js';
import { createPool } from '../src/shared/database/create-pool.js';
import { startServers } from './servers.js';

interface Booking {
  id: string;
  resourceId: string;
  start: number;
  end: number;
  status: 'active' | 'cancelled';
}

interface Reply {
  status: number;
  body: any;
}

const postgres = process.env.DB_DRIVER === 'postgres';
const instances = postgres ? Number(process.env.INSTANCES ?? 3) : 1;
const pool = postgres ? createPool(loadConfig().DATABASE_URL) : undefined;

let urls: string[] = [];
let next = 0;
/** Round-robin across instances, like a load balancer would. */
async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<Reply> {
  const url = urls[next++ % urls.length]!;
  const response = await fetch(url + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

const create = (id: string, resourceId: string, start: number, end: number) =>
  call('POST', '/bookings', { id, resourceId, start, end });

const byBytes = (a: string, b: string) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));
const isSorted = (ids: string[]) =>
  ids.every((id, i) => i === 0 || byBytes(ids[i - 1]!, id) < 0);

function countBy(replies: Reply[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reply of replies) {
    const key =
      `${reply.status} ${reply.body.code ?? reply.body.outcome ?? reply.body.status ?? ''}`.trim();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Invariants checked through the API (and through SQL in Postgres mode). */
async function invariantViolations(
  acceptedIds: Iterable<string>,
): Promise<string[]> {
  const violations: string[] = [];
  const all: Booking[] = (await call('GET', '/bookings')).body;
  const ids = all.map((b) => b.id);
  if (new Set(ids).size !== ids.length)
    violations.push('duplicate ids in GET /bookings');
  if (!isSorted(ids))
    violations.push('GET /bookings is not in ascending id order');

  const known = new Set(ids);
  for (const id of acceptedIds) {
    if (!known.has(id)) violations.push(`accepted booking "${id}" is missing`);
  }

  const active = all.filter((b) => b.status === 'active');
  const byResource = Map.groupBy(active, (b) => b.resourceId);
  for (const [resourceId, bookings] of byResource) {
    bookings.sort((a, b) => a.start - b.start);
    for (let i = 1; i < bookings.length; i++) {
      const previous = bookings[i - 1]!;
      const current = bookings[i]!;
      if (current.start < previous.end) {
        violations.push(
          `overlap on ${resourceId}: ${previous.id} [${previous.start},${previous.end}) × ${current.id} [${current.start},${current.end})`,
        );
      }
    }
  }

  if (pool) {
    const { rows } = await pool.query(
      `SELECT a.id AS a, b.id AS b FROM bookings a
         JOIN bookings b ON a.resource_id = b.resource_id AND a.id < b.id
                        AND a.period && b.period
        WHERE a.status = 'active' AND b.status = 'active'`,
    );
    for (const row of rows) violations.push(`SQL overlap: ${row.a} × ${row.b}`);
  }
  return violations;
}

interface ScenarioResult {
  name: string;
  requests: number;
  ms: number;
  outcomes: Record<string, number>;
  violations: string[];
}

async function scenario(
  name: string,
  body: () => Promise<{
    replies: Reply[];
    accepted: string[];
    violations: string[];
  }>,
): Promise<ScenarioResult> {
  if (pool) await pool.query('TRUNCATE bookings');
  const servers = await startServers(instances, {
    DB_DRIVER: postgres ? 'postgres' : 'memory',
  });
  urls = servers.urls;
  try {
    const started = performance.now();
    const { replies, accepted, violations } = await body();
    const ms = Math.round(performance.now() - started);
    const serverErrors = replies.filter((r) => r.status >= 500);
    if (serverErrors.length > 0) {
      violations.push(
        `${serverErrors.length} responses with 5xx: ${JSON.stringify(serverErrors[0]!.body)}`,
      );
    }
    violations.push(...(await invariantViolations(accepted)));
    return {
      name,
      requests: replies.length,
      ms,
      outcomes: countBy(replies),
      violations,
    };
  } finally {
    await servers.stop();
  }
}

const N = Number(process.env.CONCURRENCY ?? 200);
const accepted = (replies: Reply[]) =>
  replies.filter((r) => r.status === 201).map((r) => r.body.id as string);

const scenarios = [
  () =>
    scenario(
      `hot slot: ${N} distinct ids book ROOM-A [100,200) at once`,
      async () => {
        const replies = await Promise.all(
          Array.from({ length: N }, (_, i) =>
            create(`hot-${i}`, 'ROOM-A', 100, 200),
          ),
        );
        const violations: string[] = [];
        if (accepted(replies).length !== 1)
          violations.push(
            `expected 1 accepted, got ${accepted(replies).length}`,
          );
        return { replies, accepted: accepted(replies), violations };
      },
    ),

  () =>
    scenario(
      `staircase: ${N} periods [i, i+3) on ROOM-A, each overlapping its neighbours`,
      async () => {
        const replies = await Promise.all(
          Array.from({ length: N }, (_, i) =>
            create(`step-${i}`, 'ROOM-A', i, i + 3),
          ),
        );
        return { replies, accepted: accepted(replies), violations: [] };
      },
    ),

  () =>
    scenario(
      `same id: ${N} requests with id "dup" on free, distinct slots`,
      async () => {
        const replies = await Promise.all(
          Array.from({ length: N }, (_, i) =>
            create('dup', i % 2 ? 'R1' : 'R2', i * 10, i * 10 + 5),
          ),
        );
        const violations: string[] = [];
        if (accepted(replies).length !== 1)
          violations.push(
            `expected 1 accepted, got ${accepted(replies).length}`,
          );
        const others = replies.filter((r) => r.status !== 201);
        if (others.some((r) => r.body.code !== 'id_already_used')) {
          violations.push('a rejected duplicate was not id_already_used');
        }
        return { replies, accepted: accepted(replies), violations };
      },
    ),

  () =>
    scenario(
      `cancel storm: ${N} concurrent cancellations of one booking`,
      async () => {
        await create('target', 'R1', 0, 10);
        const replies = await Promise.all(
          Array.from({ length: N }, () =>
            call('POST', '/bookings/target/cancellation'),
          ),
        );
        const cancelled = replies.filter(
          (r) => r.body.outcome === 'cancelled',
        ).length;
        const violations: string[] = [];
        if (cancelled !== 1)
          violations.push(`expected exactly 1 "cancelled", got ${cancelled}`);
        return { replies, accepted: ['target'], violations };
      },
    ),

  () =>
    scenario(
      `cancel vs rebook: cancel "old" while ${N} requests try to take its slot`,
      async () => {
        await create('old', 'ROOM-B', 0, 100);
        const replies = await Promise.all([
          call('POST', '/bookings/old/cancellation'),
          ...Array.from({ length: N }, (_, i) =>
            create(`new-${i}`, 'ROOM-B', 0, 100),
          ),
        ]);
        const newOnes = accepted(replies);
        const violations: string[] = [];
        if (newOnes.length > 1)
          violations.push(`${newOnes.length} bookings took the freed slot`);
        return { replies, accepted: ['old', ...newOnes], violations };
      },
    ),

  () =>
    scenario(
      `chaos: ${Math.round(N / 4)} workers × ${process.env.CHAOS_SECONDS ?? 10}s of random create/cancel/availability`,
      async () => {
        const workers = Math.round(N / 4);
        const deadline =
          Date.now() + Number(process.env.CHAOS_SECONDS ?? 10) * 1000;
        const resources = ['R1', 'R2', 'ROOM-A'];
        const created: string[] = [];
        const replies: Reply[] = [];
        const violations: string[] = [];
        let seq = 0;
        const rand = (n: number) => Math.floor(Math.random() * n);

        async function worker(): Promise<void> {
          while (Date.now() < deadline) {
            const roll = Math.random();
            const resourceId = resources[rand(resources.length)]!;
            const start = rand(1000);
            const end = start + 1 + rand(30);
            if (roll < 0.55) {
              const reply = await create(`c-${seq++}`, resourceId, start, end);
              replies.push(reply);
              if (reply.status === 201) created.push(reply.body.id);
              if (reply.body.code === 'conflict') {
                const conflictingIds: string[] = reply.body.conflictingIds;
                if (!isSorted(conflictingIds)) {
                  violations.push('conflictingIds not sorted');
                }
                if (conflictingIds.length === 0) {
                  violations.push('conflict without conflictingIds');
                }
              }
            } else if (roll < 0.75 && created.length > 0) {
              replies.push(
                await call(
                  'POST',
                  `/bookings/${created[rand(created.length)]}/cancellation`,
                ),
              );
            } else {
              const reply = await call(
                'GET',
                `/resources/${resourceId}/availability?start=${start}&end=${end}`,
              );
              replies.push(reply);
              const conflicts: Booking[] = reply.body.conflicts ?? [];
              if (!isSorted(conflicts.map((c) => c.id)))
                violations.push('availability conflicts not sorted');
              if (reply.body.available !== (conflicts.length === 0))
                violations.push('available disagrees with conflicts');
              for (const c of conflicts) {
                if (
                  c.resourceId !== resourceId ||
                  !(c.start < end && start < c.end)
                ) {
                  violations.push(
                    `availability returned a non-overlapping booking ${c.id}`,
                  );
                }
              }
            }
          }
        }
        await Promise.all(Array.from({ length: workers }, worker));
        return {
          replies,
          accepted: created,
          violations: [...new Set(violations)],
        };
      },
    ),
];

if (pool) {
  scenarios.push(() =>
    scenario(
      'connection kill: terminate every API connection under load, then recover',
      async () => {
        const replies: Reply[] = [];
        const violations: string[] = [];
        let seq = 0;
        let running = true;
        const load = Array.from({ length: 20 }, async () => {
          while (running) {
            const start = Math.floor(Math.random() * 5000);
            replies.push(await create(`k-${seq++}`, 'R1', start, start + 1));
          }
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const { rows } = await pool.query<{ killed: number }>(
          `SELECT count(pg_terminate_backend(pid))::int AS killed
             FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        running = false;
        await Promise.all(load);

        // Requests in flight on a killed connection may fail; what matters is
        // that every instance survives and keeps serving new requests.
        const ok = replies.filter((reply) => reply.status < 500);
        const failedInFlight = replies.length - ok.length;
        for (const url of urls) {
          const health = await fetch(`${url}/health`).catch(() => undefined);
          if (health?.status !== 200) {
            violations.push(
              `${url} did not recover (health ${health?.status ?? 'down'})`,
            );
          }
        }
        const after = await create('after-kill', 'R2', 0, 1);
        if (after.status !== 201) {
          violations.push(`create after the kill returned ${after.status}`);
        }
        console.log(
          `  killed ${rows[0]!.killed} connections; ${failedInFlight} in-flight requests failed`,
        );
        return {
          replies: [...ok, after],
          accepted: [...accepted(ok), 'after-kill'],
          violations,
        };
      },
    ),
  );
}

console.log(
  `Race harness — DB_DRIVER=${postgres ? 'postgres' : 'memory'}, ${instances} instance(s), concurrency ${N}\n`,
);
let failed = 0;
try {
  for (const run of scenarios) {
    const result = await run();
    const ok = result.violations.length === 0;
    if (!ok) failed += 1;
    console.log(`${ok ? '✔' : '✘'} ${result.name}`);
    console.log(
      `  ${result.requests} requests in ${result.ms} ms → ${JSON.stringify(result.outcomes)}`,
    );
    for (const violation of result.violations.slice(0, 10))
      console.log(`  ✘ ${violation}`);
  }
} finally {
  await pool?.end();
}
console.log(
  failed === 0
    ? '\nAll invariants held.'
    : `\n${failed} scenario(s) violated invariants.`,
);
process.exitCode = failed === 0 ? 0 : 1;
