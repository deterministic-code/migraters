import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'dialects/postgres/**/*.test.ts',
      'dialects/mysql/**/*.test.ts',
      'dialects/sqlserver/**/*.test.ts',
      'dialects/oracle/**/*.test.ts',
      'dialects/sqlite/**/*.paths.test.ts',
      'test/help-integration.test.ts',
    ],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: [
        'dialects/postgres/**/*.ts',
        'dialects/mysql/**/*.ts',
        'dialects/sqlserver/**/*.ts',
        'dialects/oracle/**/*.ts',
      ],
      exclude: ['dialects/**/*.test.ts', 'dialects/**/index.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
