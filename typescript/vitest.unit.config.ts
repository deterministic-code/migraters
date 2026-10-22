import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'providers/sqlite/**/*.test.ts'],
    exclude: [
      'test/cli-parity.e2e.test.ts',
      'test/readme-install.test.ts',
      'test/help-integration.test.ts',
      'providers/**/*.paths.test.ts',
    ],
  },
});
