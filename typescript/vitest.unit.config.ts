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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/bin/**',
        'src/generate-help.ts',
        'src/migration-client.ts',
        'src/abstractions/datasource-provider.ts',
        'src/abstractions/migrater.ts',
        'src/abstractions/sql-dialect.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
