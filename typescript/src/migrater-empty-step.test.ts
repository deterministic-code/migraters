import { describe, expect, it, vi } from 'vitest';

vi.mock('./datasource-migrate.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./datasource-migrate.ts')>();
  return {
    ...actual,
    discoverMigrations: vi.fn(async () => []),
    applyOneUp: vi.fn(async () => ({ applied: true, name: null })),
    applyOneDown: vi.fn(async () => ({ rolledBack: false, name: null })),
  };
});

import { SqliteProvider } from '../providers/sqlite/src/sqlite-provider.ts';
import { Migrater } from './migrater.ts';

describe('Migrater empty apply step', () => {
  it('breaks when an up step has no name and down did not roll back', async () => {
    const migrater = new Migrater(new SqliteProvider());
    expect(await migrater.up({ connection: 'c', migrationsPath: '/tmp' })).toEqual([]);
    expect(await migrater.down({ connection: 'c', migrationsPath: '/tmp' })).toBeNull();
  });
});
