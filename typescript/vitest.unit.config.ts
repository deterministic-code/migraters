import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'dialects/sqlite/**/*.test.ts'],
    exclude: [
      'test/cli-parity.e2e.test.ts',
      'test/readme-install.test.ts',
      'dialects/**/*.paths.test.ts',
    ],
    fileParallelism: false,
  },
});
