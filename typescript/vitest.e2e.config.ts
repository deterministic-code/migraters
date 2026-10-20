import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e.test.ts'],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 1_200_000,
  },
});
