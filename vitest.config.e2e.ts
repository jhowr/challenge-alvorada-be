import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/e2e/**/*.e2e-spec.ts'],
    // Each spec starts its own Postgres container, which can take a while
    // on a cold Docker cache.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
