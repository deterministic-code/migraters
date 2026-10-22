import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'providers/postgres/**/*.test.ts',
      'providers/mysql/**/*.test.ts',
      'providers/sqlserver/**/*.test.ts',
      'providers/oracle/**/*.test.ts',
      'providers/sqlite/**/*.paths.test.ts',
      'test/help-integration.test.ts',
    ],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: [
        'providers/postgres/**/*.ts',
        'providers/mysql/**/*.ts',
        'providers/sqlserver/**/*.ts',
        'providers/oracle/**/*.ts',
      ],
      exclude: ['providers/**/*.test.ts', 'providers/**/index.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
