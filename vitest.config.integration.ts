import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    // Starting a Postgres container can take a while on a cold Docker cache.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
